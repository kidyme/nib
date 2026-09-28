use crate::agent_store::{self, Dataset};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Map, Value};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const API_VERSION: &str = "v1";
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

pub struct ServerHandle {
    stop: Arc<AtomicBool>,
    join: Mutex<Option<JoinHandle<()>>>,
    discovery_path: PathBuf,
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut join) = self.join.lock() {
            if let Some(handle) = join.take() {
                let _ = handle.join();
            }
        }
        let _ = fs::remove_file(&self.discovery_path);
    }
}

pub fn start(data_dir: &Path) -> Result<ServerHandle, String> {
    let db_path = ensure_database(data_dir)?;
    let token = create_token()?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("bind server: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("configure server: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("read server address: {e}"))?
        .port();
    let discovery_path = data_dir.join("agent-server.json");
    write_discovery(&discovery_path, port, &token)?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_token = token.clone();
    let thread_db_path = db_path.clone();
    let join = thread::Builder::new()
        .name("nib-agent-server".into())
        .spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = handle_connection(stream, &thread_db_path, &thread_token);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(40))
                    }
                    Err(_) => break,
                }
            }
        })
        .map_err(|e| format!("start server thread: {e}"))?;
    Ok(ServerHandle {
        stop,
        join: Mutex::new(Some(join)),
        discovery_path,
    })
}

pub fn ensure_database(data_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(data_dir).map_err(|e| format!("create data directory: {e}"))?;
    let db_path = data_dir.join("nib.sqlite3");
    initialize_database(&db_path, data_dir)?;
    Ok(db_path)
}

pub fn read_payload(data_dir: &Path, dataset: Dataset) -> Result<Option<String>, String> {
    let db_path = ensure_database(data_dir)?;
    let connection = open_connection(&db_path)?;
    export_dataset(&connection, dataset_name(dataset))
        .map_err(|e| format!("read SQLite state: {e}"))
}

pub fn write_payload(
    data_dir: &Path,
    dataset: Dataset,
    payload: &str,
    actor: &str,
    action: &str,
    request_id: Option<&str>,
) -> Result<String, String> {
    let db_path = ensure_database(data_dir)?;
    let connection = open_connection(&db_path)?;
    let audit_id = write_dataset(
        &connection,
        dataset_name(dataset),
        payload,
        actor,
        action,
        request_id,
    )
    .map_err(|e| format!("write SQLite state: {e}"))?;
    agent_store::write(
        dataset,
        &export_dataset(&connection, dataset_name(dataset))
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| payload.to_string()),
        Some(data_dir),
    )?;
    Ok(audit_id)
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|e| format!("open SQLite: {e}"))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("configure SQLite: {e}"))?;
    Ok(connection)
}

fn initialize_database(db_path: &Path, data_dir: &Path) -> Result<(), String> {
    let connection = open_connection(db_path)?;
    connection
        .execute_batch(SCHEMA)
        .map_err(|e| format!("initialize SQLite: {e}"))?;
    connection.execute("INSERT INTO schema_meta(key,value) VALUES ('schema_version','2') ON CONFLICT(key) DO UPDATE SET value=excluded.value", []).map_err(|e| format!("record schema version: {e}"))?;

    // Migrate the first implementation's JSON state table, if present. Normalized tables are
    // authoritative after this point; the legacy table is intentionally left untouched.
    for dataset in [Dataset::Loop, Dataset::Atlas] {
        let name = dataset_name(dataset);
        let has_rows =
            dataset_has_rows(&connection, name).map_err(|e| format!("check {name}: {e}"))?;
        if has_rows {
            continue;
        }
        let legacy: Option<String> = connection
            .query_row(
                "SELECT payload_json FROM state WHERE dataset = ?1",
                [name],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);
        let contents = legacy.or(agent_store::read(dataset, Some(data_dir))?);
        if let Some(contents) = contents {
            if validate_export_payload(&contents).is_ok() {
                write_dataset(
                    &connection,
                    name,
                    &contents,
                    "migration",
                    "import_legacy_json",
                    None,
                )
                .map_err(|e| format!("migrate {name}: {e}"))?;
            }
        }
    }
    Ok(())
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loop_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS loop_statuses (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS loop_labels (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS loop_cards (
  id TEXT PRIMARY KEY, list_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  status_id TEXT, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
  started_at TEXT, completed_at TEXT, status_changed_at TEXT, archived_at TEXT, deleted_at TEXT,
  FOREIGN KEY(list_id) REFERENCES loop_lists(id), FOREIGN KEY(status_id) REFERENCES loop_statuses(id)
);
CREATE INDEX IF NOT EXISTS idx_loop_cards_list_order ON loop_cards(list_id, sort_order);
CREATE TABLE IF NOT EXISTS loop_card_labels (
  card_id TEXT NOT NULL, label_id TEXT NOT NULL, PRIMARY KEY(card_id, label_id),
  FOREIGN KEY(card_id) REFERENCES loop_cards(id) ON DELETE CASCADE,
  FOREIGN KEY(label_id) REFERENCES loop_labels(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS loop_card_links (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, sort_order INTEGER NOT NULL,
  FOREIGN KEY(card_id) REFERENCES loop_cards(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS loop_settings (id INTEGER PRIMARY KEY CHECK(id = 1), show_status INTEGER NOT NULL, show_labels INTEGER NOT NULL, show_links INTEGER NOT NULL, density TEXT NOT NULL, column_width INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS atlas_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS atlas_links (
  id TEXT PRIMARY KEY, category_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, sort_order INTEGER NOT NULL,
  FOREIGN KEY(category_id) REFERENCES atlas_categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS atlas_settings (id INTEGER PRIMARY KEY CHECK(id = 1), card_width INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, module TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, request_id TEXT, input_json TEXT, before_json TEXT,
  after_json TEXT, summary TEXT, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_module_created_at ON audit_log(module, created_at DESC);
-- Kept only so databases created by the first server can be upgraded without data loss.
CREATE TABLE IF NOT EXISTS state (dataset TEXT PRIMARY KEY, version INTEGER NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
"#;

fn dataset_has_rows(connection: &Connection, dataset: &str) -> rusqlite::Result<bool> {
    let sql = if dataset == "loop" {
        "SELECT 1 FROM loop_settings WHERE id = 1"
    } else {
        "SELECT 1 FROM atlas_settings WHERE id = 1"
    };
    Ok(connection
        .query_row(sql, [], |_| Ok(()))
        .optional()?
        .is_some())
}

fn handle_connection(mut stream: TcpStream, db_path: &Path, token: &str) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let request = read_request(&mut stream)?;
    write_response(&mut stream, route(request, db_path, token))
}

struct Request {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}
struct Response {
    status: u16,
    body: String,
    content_type: &'static str,
}

fn read_request(stream: &mut TcpStream) -> Result<Request, String> {
    let mut buffer = Vec::new();
    let header_end = loop {
        let mut chunk = [0_u8; 4096];
        let count = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if count == 0 {
            return Err("empty request".into());
        }
        buffer.extend_from_slice(&chunk[..count]);
        if buffer.len() > MAX_BODY_BYTES + 32 * 1024 {
            return Err("request too large".into());
        }
        if let Some(position) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            break position;
        }
    };
    let header_text = std::str::from_utf8(&buffer[..header_end]).map_err(|_| "invalid headers")?;
    let mut lines = header_text.split("\r\n");
    let mut parts = lines
        .next()
        .ok_or("missing request line")?
        .split_whitespace();
    let method = parts.next().ok_or("missing method")?.to_string();
    let path = parts.next().ok_or("missing path")?.to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect::<Vec<_>>();
    let content_length = header(&headers, "content-length")
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| "invalid content-length")?;
    if content_length > MAX_BODY_BYTES {
        return Err("request body too large".into());
    }
    let body_start = header_end + 4;
    while buffer.len() < body_start + content_length {
        let mut chunk = [0_u8; 4096];
        let count = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if count == 0 {
            return Err("truncated request body".into());
        }
        buffer.extend_from_slice(&chunk[..count]);
    }
    let body = String::from_utf8(buffer[body_start..body_start + content_length].to_vec())
        .map_err(|_| "request body is not UTF-8")?;
    Ok(Request {
        method,
        path,
        headers,
        body,
    })
}

fn route(request: Request, db_path: &Path, token: &str) -> Response {
    let path = request.path.split('?').next().unwrap_or(&request.path);
    if path == "/api/v1/health" && request.method == "GET" {
        return json_response(200, json!({"ok":true,"apiVersion":API_VERSION}));
    }
    if header(&request.headers, "authorization") != Some(&format!("Bearer {token}")[..]) {
        return json_response(401, json!({"ok":false,"error":"unauthorized"}));
    }
    if path == "/api/v1/skill" && request.method == "GET" {
        return json_response(200, skill_manifest());
    }
    let segments: Vec<_> = path.trim_matches('/').split('/').collect();
    if segments.len() < 3 || segments[0] != "api" || segments[1] != API_VERSION {
        return json_response(404, json!({"ok":false,"error":"not found"}));
    }
    let dataset = match segments[2] {
        "loop" => "loop",
        "atlas" => "atlas",
        _ => return json_response(404, json!({"ok":false,"error":"unknown dataset"})),
    };
    let connection = match open_connection(db_path) {
        Ok(c) => c,
        Err(e) => return json_response(500, json!({"ok":false,"error":e})),
    };
    let actor = header(&request.headers, "x-nib-actor").unwrap_or("user");
    let request_id = header(&request.headers, "x-nib-request-id");
    match (request.method.as_str(), segments.get(3).copied()) {
        ("GET", None) | ("GET", Some("export")) => match export_dataset(&connection, dataset) {
            Ok(Some(payload)) => raw_json_response(200, payload),
            Ok(None) => json_response(404, json!({"ok":false,"error":"dataset not initialized"})),
            Err(e) => json_response(500, json!({"ok":false,"error":e.to_string()})),
        },
        ("GET", Some("audit-logs")) => match read_audit_logs(&connection, dataset) {
            Ok(logs) => json_response(200, json!({"ok":true,"data":logs})),
            Err(e) => json_response(500, json!({"ok":false,"error":e.to_string()})),
        },
        ("PUT", None) | ("POST", Some("import")) => {
            let payload = match validate_export_payload(&request.body) {
                Ok(p) => p,
                Err(e) => return json_response(400, json!({"ok":false,"error":e})),
            };
            let action = if request.method == "POST" {
                "import"
            } else {
                "replace"
            };
            match write_dataset(&connection, dataset, payload, actor, action, request_id) {
                Ok(audit_id) => {
                    sync_legacy_and_response(&connection, dataset, audit_id, db_path.parent())
                }
                Err(e) => json_response(400, json!({"ok":false,"error":e.to_string()})),
            }
        }
        // Fine-grained routes are intentionally implemented as JSON mutations over the normalized
        // repository. The repository replacement is still one SQLite transaction and prevents
        // stale whole-document writes from being needed by agents.
        ("POST", Some("cards")) if dataset == "loop" && segments.len() == 4 => {
            match mutate_json_dataset(
                &connection,
                dataset,
                "create_card",
                &request.body,
                actor,
                request_id,
                create_loop_card,
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("PATCH", Some("cards")) if dataset == "loop" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "update_card",
                &request.body,
                actor,
                request_id,
                |value, body| update_loop_card(value, id, body),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("POST", Some("cards"))
            if dataset == "loop" && segments.len() >= 6 && segments[5] == "move" =>
        {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "move_card",
                &request.body,
                actor,
                request_id,
                |value, body| move_loop_card_json(value, id, body),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("DELETE", Some("cards")) if dataset == "loop" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "delete_card",
                "{}",
                actor,
                request_id,
                |value, _| delete_loop_card(value, id),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("POST", Some("categories")) if dataset == "atlas" => {
            match mutate_json_dataset(
                &connection,
                dataset,
                "create_category",
                &request.body,
                actor,
                request_id,
                create_atlas_category,
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("PATCH", Some("categories")) if dataset == "atlas" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "update_category",
                &request.body,
                actor,
                request_id,
                |value, body| update_atlas_category(value, id, body),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("DELETE", Some("categories")) if dataset == "atlas" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "delete_category",
                "{}",
                actor,
                request_id,
                |value, _| delete_atlas_category(value, id),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("POST", Some("links")) if dataset == "atlas" && segments.len() == 4 => {
            match mutate_json_dataset(
                &connection,
                dataset,
                "create_link",
                &request.body,
                actor,
                request_id,
                create_atlas_link,
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("PATCH", Some("links")) if dataset == "atlas" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "update_link",
                &request.body,
                actor,
                request_id,
                |value, body| update_atlas_link(value, id, body),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("DELETE", Some("links")) if dataset == "atlas" && segments.len() >= 5 => {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "delete_link",
                "{}",
                actor,
                request_id,
                |value, _| delete_atlas_link(value, id),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        ("POST", Some("links"))
            if dataset == "atlas" && segments.len() >= 6 && segments[5] == "move" =>
        {
            let id = segments[4];
            match mutate_json_dataset(
                &connection,
                dataset,
                "move_link",
                &request.body,
                actor,
                request_id,
                |value, body| move_atlas_link(value, id, body),
            ) {
                Ok((data, audit_id)) => {
                    sync_legacy_and_data(&connection, dataset, data, audit_id, db_path.parent())
                }
                Err((status, error)) => json_response(status, json!({"ok":false,"error":error})),
            }
        }
        _ => json_response(404, json!({"ok":false,"error":"not found"})),
    }
}

fn write_dataset(
    connection: &Connection,
    dataset: &str,
    payload: &str,
    actor: &str,
    action: &str,
    request_id: Option<&str>,
) -> rusqlite::Result<String> {
    let before = export_dataset(connection, dataset)?.unwrap_or_else(|| "null".into());
    if dataset == "loop" && before != "null" {
        validate_loop_transition(&before, payload)?;
    }
    let transaction = connection.unchecked_transaction()?;
    replace_dataset(
        &transaction,
        dataset,
        &serde_json::from_str(payload).map_err(|_| rusqlite::Error::InvalidQuery)?,
    )?;
    let after = payload.to_string();
    let audit_id = format!("audit_{}", unique_suffix());
    let now = timestamp();
    transaction.execute("INSERT INTO audit_log(id,module,actor,action,target_type,request_id,input_json,before_json,after_json,summary,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'success',?11)", params![audit_id, dataset, actor, action, dataset, request_id, payload, before, after, format!("{action} {dataset}"), now])?;
    transaction.commit()?;
    Ok(audit_id)
}

fn replace_dataset(tx: &Transaction<'_>, dataset: &str, value: &Value) -> rusqlite::Result<()> {
    if dataset == "loop" {
        replace_loop(tx, value)
    } else {
        replace_atlas(tx, value)
    }
}

fn replace_loop(tx: &Transaction<'_>, value: &Value) -> rusqlite::Result<()> {
    tx.execute_batch("DELETE FROM loop_card_labels; DELETE FROM loop_card_links; DELETE FROM loop_cards; DELETE FROM loop_lists; DELETE FROM loop_statuses; DELETE FROM loop_labels; DELETE FROM loop_settings;")?;
    let lists = value
        .get("lists")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let statuses = value
        .get("statuses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let labels = value
        .get("labels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for (i, item) in lists.iter().enumerate() {
        let id = text(item, "id").unwrap_or_else(|| format!("list_{i}"));
        let role = list_role(item, &id);
        tx.execute(
            "INSERT INTO loop_lists(id,name,role,sort_order) VALUES (?1,?2,?3,?4)",
            params![
                id,
                text(item, "name").unwrap_or_else(|| "未命名列表".into()),
                role,
                i as i64
            ],
        )?;
    }
    for (i, item) in statuses.iter().enumerate() {
        tx.execute(
            "INSERT INTO loop_statuses(id,name,color,sort_order) VALUES (?1,?2,?3,?4)",
            params![
                text(item, "id").unwrap_or_else(|| format!("status_{i}")),
                text(item, "name").unwrap_or_else(|| "未命名".into()),
                text(item, "color").unwrap_or_else(|| "#888888".into()),
                i as i64
            ],
        )?;
    }
    for (i, item) in labels.iter().enumerate() {
        tx.execute(
            "INSERT INTO loop_labels(id,name,color,sort_order) VALUES (?1,?2,?3,?4)",
            params![
                text(item, "id").unwrap_or_else(|| format!("label_{i}")),
                text(item, "name").unwrap_or_else(|| "未命名".into()),
                text(item, "color").unwrap_or_else(|| "#888888".into()),
                i as i64
            ],
        )?;
    }
    let now = timestamp();
    for (i, item) in value
        .get("cards")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .enumerate()
    {
        let id = text(item, "id").unwrap_or_else(|| format!("card_{i}"));
        let list_id = text(item, "listId")
            .or_else(|| lists.first().and_then(|x| text(x, "id")))
            .unwrap_or_else(|| "list_todo".into());
        let created = time(item, "createdAt").unwrap_or_else(|| now.clone());
        let list_role = lists
            .iter()
            .find(|x| text(x, "id").as_deref() == Some(&list_id))
            .and_then(|x| list_role(x, &list_id));
        let archived = time(item, "archivedAt")
            .or_else(|| (list_role.as_deref() == Some("archive")).then(|| now.clone()));
        let deleted = time(item, "deletedAt")
            .or_else(|| (list_role.as_deref() == Some("trash")).then(|| now.clone()));
        let completed = time(item, "completedAt");
        let started = time(item, "startedAt");
        tx.execute("INSERT INTO loop_cards(id,list_id,title,description,status_id,sort_order,created_at,updated_at,started_at,completed_at,status_changed_at,archived_at,deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)", params![id, list_id, text(item,"title").unwrap_or_else(|| "未命名".into()), text(item,"description").unwrap_or_default(), text(item,"statusId"), number(item,"order").unwrap_or(i as i64), created, time(item,"updatedAt"), started, completed, time(item,"statusChangedAt"), archived, deleted])?;
        if let Some(array) = item.get("labelIds").and_then(Value::as_array) {
            for label in array.iter().filter_map(Value::as_str) {
                tx.execute(
                    "INSERT OR IGNORE INTO loop_card_labels(card_id,label_id) VALUES (?1,?2)",
                    params![id, label],
                )?;
            }
        }
        if let Some(array) = item.get("links").and_then(Value::as_array) {
            for (j, link) in array.iter().enumerate() {
                if let (Some(link_id), Some(url)) = (text(link, "id"), text(link, "url")) {
                    tx.execute("INSERT INTO loop_card_links(id,card_id,name,url,sort_order) VALUES (?1,?2,?3,?4,?5)", params![link_id,id,text(link,"name").unwrap_or_else(|| url.clone()),url,j as i64])?;
                }
            }
        }
    }
    let settings = value.get("settings").unwrap_or(&Value::Null);
    tx.execute("INSERT INTO loop_settings(id,show_status,show_labels,show_links,density,column_width) VALUES (1,?1,?2,?3,?4,?5)", params![bool_int(settings,"showStatus",true), bool_int(settings,"showLabels",true), bool_int(settings,"showLinks",true), text(settings,"density").unwrap_or_else(|| "comfortable".into()), number(settings,"columnWidth").unwrap_or(340)])?;
    Ok(())
}

fn replace_atlas(tx: &Transaction<'_>, value: &Value) -> rusqlite::Result<()> {
    tx.execute_batch(
        "DELETE FROM atlas_links; DELETE FROM atlas_categories; DELETE FROM atlas_settings;",
    )?;
    for (i, category) in value
        .get("categories")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .enumerate()
    {
        let id = text(category, "id").unwrap_or_else(|| format!("category_{i}"));
        tx.execute(
            "INSERT INTO atlas_categories(id,name,sort_order) VALUES (?1,?2,?3)",
            params![
                id,
                text(category, "name").unwrap_or_else(|| "未命名分类".into()),
                i as i64
            ],
        )?;
        for (j, link) in category
            .get("links")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .iter()
            .enumerate()
        {
            if let (Some(link_id), Some(url)) = (text(link, "id"), text(link, "url")) {
                tx.execute("INSERT INTO atlas_links(id,category_id,title,url,sort_order) VALUES (?1,?2,?3,?4,?5)",params![link_id,id,text(link,"title").unwrap_or_else(|| url.clone()),url,j as i64])?;
            }
        }
    }
    tx.execute(
        "INSERT INTO atlas_settings(id,card_width) VALUES (1,?1)",
        params![number(value.get("settings").unwrap_or(&Value::Null), "cardWidth").unwrap_or(166)],
    )?;
    Ok(())
}

fn export_dataset(connection: &Connection, dataset: &str) -> rusqlite::Result<Option<String>> {
    if !dataset_has_rows(connection, dataset)? {
        return Ok(None);
    }
    if dataset == "loop" {
        Ok(Some(export_loop(connection)?))
    } else {
        Ok(Some(export_atlas(connection)?))
    }
}

fn export_loop(conn: &Connection) -> rusqlite::Result<String> {
    let mut lists = Vec::new();
    let mut stmt = conn.prepare("SELECT id,name,role FROM loop_lists ORDER BY sort_order")?;
    for row in stmt.query_map([], |r| { Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"role":r.get::<_,Option<String>>(2)?})) })? { let mut v=row?; if v.get("role")==Some(&Value::Null) { v.as_object_mut().unwrap().remove("role"); } lists.push(v); }
    let statuses = query_options(conn, "loop_statuses")?;
    let labels = query_options(conn, "loop_labels")?;
    let mut cards = Vec::new();
    let mut stmt=conn.prepare("SELECT id,list_id,title,description,status_id,sort_order,created_at,updated_at,started_at,completed_at,status_changed_at,archived_at,deleted_at FROM loop_cards ORDER BY sort_order,id")?;
    for row in stmt.query_map([], |r| card_json(conn, r))? {
        cards.push(row?);
    }
    let settings: Value = conn.query_row("SELECT show_status,show_labels,show_links,density,column_width FROM loop_settings WHERE id=1", [], |r| Ok(json!({"showStatus":r.get::<_,i64>(0)?!=0,"showLabels":r.get::<_,i64>(1)?!=0,"showLinks":r.get::<_,i64>(2)?!=0,"density":r.get::<_,String>(3)?,"columnWidth":r.get::<_,i64>(4)?}))).optional()?.unwrap_or_else(|| json!({"showStatus":true,"showLabels":true,"showLinks":true,"density":"comfortable","columnWidth":340}));
    Ok(json!({"lists":lists,"statuses":statuses,"labels":labels,"cards":cards,"settings":settings}).to_string())
}

fn export_atlas(conn: &Connection) -> rusqlite::Result<String> {
    let mut categories = Vec::new();
    let mut stmt = conn.prepare("SELECT id,name FROM atlas_categories ORDER BY sort_order")?;
    for row in stmt.query_map([], |r| { let id:String=r.get(0)?; let name:String=r.get(1)?; let mut links=Vec::new(); let mut ls=conn.prepare("SELECT id,title,url FROM atlas_links WHERE category_id=?1 ORDER BY sort_order")?; for l in ls.query_map([&id],|x|Ok(json!({"id":x.get::<_,String>(0)?,"title":x.get::<_,String>(1)?,"url":x.get::<_,String>(2)?})))? { links.push(l?); } Ok(json!({"id":id,"name":name,"links":links})) })? { categories.push(row?); }
    let settings: Value = conn
        .query_row(
            "SELECT card_width FROM atlas_settings WHERE id=1",
            [],
            |r| Ok(json!({"cardWidth":r.get::<_,i64>(0)?})),
        )
        .optional()?
        .unwrap_or_else(|| json!({"cardWidth":166}));
    Ok(json!({"categories":categories,"settings":settings}).to_string())
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn time(value: &Value, key: &str) -> Option<String> {
    let value = text(value, key)?;
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn number(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

fn bool_int(value: &Value, key: &str, default: bool) -> i64 {
    value.get(key).and_then(Value::as_bool).unwrap_or(default) as i64
}

fn list_role(value: &Value, id: &str) -> Option<String> {
    text(value, "role").or_else(|| {
        let name = text(value, "name")?.to_ascii_lowercase();
        if id == "list_trash" || ["trash", "回收站", "垃圾箱"].contains(&name.as_str()) {
            Some("trash".into())
        } else if id == "list_archive" || ["archive", "归档"].contains(&name.as_str()) {
            Some("archive".into())
        } else {
            None
        }
    })
}

fn query_options(conn: &Connection, table: &str) -> rusqlite::Result<Vec<Value>> {
    let sql = format!("SELECT id,name,color FROM {table} ORDER BY sort_order");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| Ok(json!({"id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "color": r.get::<_, String>(2)?})))?;
    rows.collect()
}

fn card_json(conn: &Connection, row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let id: String = row.get(0)?;
    let mut labels = Vec::new();
    let mut stmt =
        conn.prepare("SELECT label_id FROM loop_card_labels WHERE card_id=?1 ORDER BY rowid")?;
    for item in stmt.query_map([&id], |r| r.get::<_, String>(0))? {
        labels.push(item?);
    }
    let mut links = Vec::new();
    let mut stmt = conn
        .prepare("SELECT id,name,url FROM loop_card_links WHERE card_id=?1 ORDER BY sort_order")?;
    for item in stmt.query_map([&id], |r| Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"url":r.get::<_,String>(2)?})))? { links.push(item?); }
    let optional = |index: usize| -> rusqlite::Result<Option<String>> { row.get(index) };
    let value = json!({
        "id": id,
        "listId": row.get::<_, String>(1)?,
        "title": row.get::<_, String>(2)?,
        "description": row.get::<_, String>(3)?,
        "statusId": row.get::<_, Option<String>>(4)?,
        "labelIds": labels,
        "links": links,
        "order": row.get::<_, i64>(5)?,
        "createdAt": row.get::<_, String>(6)?,
        "updatedAt": optional(7)?,
        "startedAt": optional(8)?,
        "completedAt": optional(9)?,
        "statusChangedAt": optional(10)?,
        "archivedAt": optional(11)?,
        "deletedAt": optional(12)?
    });
    Ok(value)
}

fn read_audit_logs(connection: &Connection, dataset: &str) -> rusqlite::Result<Vec<Value>> {
    let mut statement = connection.prepare("SELECT id,actor,action,target_type,target_id,request_id,input_json,before_json,after_json,summary,status,error,created_at FROM audit_log WHERE module=?1 ORDER BY created_at DESC LIMIT 200")?;
    let rows = statement.query_map([dataset], |row| {
        let decode = |index: usize| -> rusqlite::Result<Value> {
            Ok(row.get::<_, Option<String>>(index)?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null))
        };
        Ok(json!({"id":row.get::<_,String>(0)?,"actor":row.get::<_,String>(1)?,"action":row.get::<_,String>(2)?,"targetType":row.get::<_,Option<String>>(3)?,"targetId":row.get::<_,Option<String>>(4)?,"requestId":row.get::<_,Option<String>>(5)?,"input":decode(6)?,"before":decode(7)?,"after":decode(8)?,"summary":row.get::<_,Option<String>>(9)?,"status":row.get::<_,String>(10)?,"error":row.get::<_,Option<String>>(11)?,"createdAt":row.get::<_,String>(12)?}))
    })?;
    rows.collect()
}

fn validate_export_payload(payload: &str) -> Result<&str, String> {
    let value: Value = serde_json::from_str(payload).map_err(|e| format!("invalid JSON: {e}"))?;
    if !value.is_object() {
        return Err("export payload must be a JSON object".into());
    }
    Ok(payload)
}

fn skill_manifest() -> Value {
    json!({
        "ok": true, "apiVersion": API_VERSION, "name": "nib",
        "description": "Nib local agent API. SQLite is authoritative; JSON export/import shape remains compatible.",
        "transport": "HTTP on 127.0.0.1 with Bearer token from agent-server.json",
        "loopSemantics": {"completedAt":"time the card enters Done; completed cards are not reopened", "startedAt":"first time the card leaves Todo into a non-archive/non-trash list", "updatedAt":"content or business mutation time; reorder-only moves do not change it"},
        "endpoints": [
            {"method":"GET","path":"/api/v1/health"}, {"method":"GET","path":"/api/v1/skill"},
            {"method":"GET","path":"/api/v1/loop"}, {"method":"PUT","path":"/api/v1/loop"}, {"method":"POST","path":"/api/v1/loop/import"}, {"method":"GET","path":"/api/v1/loop/export"}, {"method":"GET","path":"/api/v1/loop/audit-logs"},
            {"method":"POST","path":"/api/v1/loop/cards"}, {"method":"PATCH","path":"/api/v1/loop/cards/:id"}, {"method":"POST","path":"/api/v1/loop/cards/:id/move"}, {"method":"DELETE","path":"/api/v1/loop/cards/:id"},
            {"method":"GET","path":"/api/v1/atlas"}, {"method":"PUT","path":"/api/v1/atlas"}, {"method":"POST","path":"/api/v1/atlas/import"}, {"method":"GET","path":"/api/v1/atlas/export"}, {"method":"GET","path":"/api/v1/atlas/audit-logs"},
            {"method":"POST","path":"/api/v1/atlas/categories"}, {"method":"PATCH","path":"/api/v1/atlas/categories/:id"}, {"method":"DELETE","path":"/api/v1/atlas/categories/:id"},
            {"method":"POST","path":"/api/v1/atlas/links"}, {"method":"PATCH","path":"/api/v1/atlas/links/:id"}, {"method":"DELETE","path":"/api/v1/atlas/links/:id"}, {"method":"POST","path":"/api/v1/atlas/links/:id/move"}
        ]
    })
}

fn write_response(stream: &mut TcpStream, response: Response) -> Result<(), String> {
    let body = response.body.as_bytes();
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        status_text(response.status),
        response.content_type,
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.write_all(body).map_err(|e| e.to_string())
}
fn json_response(status: u16, value: Value) -> Response {
    Response {
        status,
        body: value.to_string(),
        content_type: "application/json; charset=utf-8",
    }
}
fn raw_json_response(status: u16, body: String) -> Response {
    Response {
        status,
        body,
        content_type: "application/json; charset=utf-8",
    }
}
fn header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}
fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Error",
    }
}
fn dataset_name(dataset: Dataset) -> &'static str {
    match dataset {
        Dataset::Loop => "loop",
        Dataset::Atlas => "atlas",
    }
}
fn write_discovery(path: &Path, port: u16, token: &str) -> Result<(), String> {
    let value = json!({"apiVersion":API_VERSION,"pid":std::process::id(),"port":port,"token":token,"startedAt":timestamp()});
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, value.to_string()).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn create_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn timestamp() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let days = elapsed.as_secs() / 86400;
    let seconds = elapsed.as_secs() % 86400;
    let (y, m, d) = civil_from_days(days as i64);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds / 3600,
        (seconds / 60) % 60,
        seconds % 60,
        elapsed.subsec_millis()
    )
}
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    (y + if m <= 2 { 1 } else { 0 }, m, d)
}
fn unique_suffix() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!(
        "{}_{:09}_{}",
        elapsed.as_secs(),
        elapsed.subsec_nanos(),
        std::process::id()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn payload_validation() {
        assert!(validate_export_payload("[]").is_err());
        assert!(validate_export_payload("{} ").is_ok());
    }
    #[test]
    fn legacy_json_migrates_into_normalized_tables() {
        let dir = std::env::temp_dir().join(format!("nib-migration-{}", unique_suffix()));
        fs::create_dir_all(&dir).unwrap();
        let payload = r#"{"lists":[{"id":"list_todo","name":"Todo"}],"statuses":[],"labels":[],"cards":[{"id":"c1","listId":"list_todo","title":"legacy","description":"","order":0,"createdAt":"2026-09-01T00:00:00Z"}],"settings":{}}"#;
        agent_store::write(Dataset::Loop, payload, Some(&dir)).unwrap();
        ensure_database(&dir).unwrap();
        let output = read_payload(&dir, Dataset::Loop).unwrap().unwrap();
        let value: Value = serde_json::from_str(&output).unwrap();
        assert_eq!(value["cards"][0]["title"], "legacy");
        assert_eq!(value["cards"][0]["completedAt"], Value::Null);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn normalized_round_trip_keeps_new_times() {
        let path = std::env::temp_dir().join(format!("nib-test-{}", unique_suffix()));
        let c = Connection::open(&path).unwrap();
        c.execute_batch(SCHEMA).unwrap();
        let payload = r#"{"lists":[{"id":"list_done","name":"Done"}],"statuses":[],"labels":[],"cards":[{"id":"c1","listId":"list_done","title":"x","description":"","order":0,"createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-02T00:00:00Z","startedAt":"2026-09-01T01:00:00Z","completedAt":"2026-09-02T02:00:00Z"}],"settings":{}}"#;
        write_dataset(&c, "loop", payload, "test", "import", None).unwrap();
        let output = export_dataset(&c, "loop").unwrap().unwrap();
        let value: Value = serde_json::from_str(&output).unwrap();
        assert_eq!(value["cards"][0]["completedAt"], "2026-09-02T02:00:00Z");
        let _ = fs::remove_file(path);
    }
}

fn validate_loop_transition(before_json: &str, after_json: &str) -> rusqlite::Result<()> {
    let before: Value =
        serde_json::from_str(before_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let after: Value =
        serde_json::from_str(after_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let before_cards = before
        .get("cards")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let after_cards = after
        .get("cards")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let lists = after
        .get("lists")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for old in before_cards {
        let Some(id) = id_of(&old) else { continue };
        let Some(old_completed) = old.get("completedAt").and_then(Value::as_str) else {
            continue;
        };
        let Some(next) = after_cards.iter().find(|card| id_of(card) == Some(id)) else {
            continue;
        };
        let list_id = next.get("listId").and_then(Value::as_str).unwrap_or("");
        let role = lists
            .iter()
            .find(|list| id_of(list) == Some(list_id))
            .and_then(list_role_json);
        if !matches!(role, Some("done") | Some("archive") | Some("trash")) {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("completed card {id} cannot be reopened"),
                ),
            )));
        }
        if next.get("completedAt").and_then(Value::as_str) != Some(old_completed) {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("completedAt for card {id} is immutable"),
                ),
            )));
        }
    }
    Ok(())
}

fn sync_legacy_and_response(
    connection: &Connection,
    dataset: &str,
    audit_id: String,
    data_dir: Option<&Path>,
) -> Response {
    let exported = match export_dataset(connection, dataset) {
        Ok(Some(value)) => value,
        Ok(None) => "{}".into(),
        Err(error) => return json_response(500, json!({"ok":false,"error":error.to_string()})),
    };
    if let Ok(parsed) = Dataset::parse(dataset) {
        if let Err(error) = agent_store::write(parsed, &exported, data_dir) {
            return json_response(500, json!({"ok":false,"error":error}));
        }
    }
    json_response(
        200,
        json!({"ok":true,"data":serde_json::from_str::<Value>(&exported).unwrap_or(Value::Null),"auditLogId":audit_id}),
    )
}

fn sync_legacy_and_data(
    connection: &Connection,
    dataset: &str,
    data: Value,
    audit_id: String,
    data_dir: Option<&Path>,
) -> Response {
    let exported = match export_dataset(connection, dataset) {
        Ok(Some(value)) => value,
        Ok(None) => data.to_string(),
        Err(error) => return json_response(500, json!({"ok":false,"error":error.to_string()})),
    };
    if let Ok(parsed) = Dataset::parse(dataset) {
        if let Err(error) = agent_store::write(parsed, &exported, data_dir) {
            return json_response(500, json!({"ok":false,"error":error}));
        }
    }
    json_response(200, json!({"ok":true,"data":data,"auditLogId":audit_id}))
}

fn mutate_json_dataset<F>(
    connection: &Connection,
    dataset: &str,
    action: &str,
    body: &str,
    actor: &str,
    request_id: Option<&str>,
    mutator: F,
) -> Result<(Value, String), (u16, String)>
where
    F: FnOnce(&mut Value, &Value) -> Result<(), String>,
{
    let current = export_dataset(connection, dataset)
        .map_err(|e| (500, e.to_string()))?
        .ok_or((404, "dataset not initialized".into()))?;
    let mut value: Value = serde_json::from_str(&current).map_err(|e| (500, e.to_string()))?;
    let input: Value = if body.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(body).map_err(|e| (400, format!("invalid JSON: {e}")))?
    };
    mutator(&mut value, &input).map_err(|e| (400, e))?;
    let audit_id = write_dataset(
        connection,
        dataset,
        &value.to_string(),
        actor,
        action,
        request_id,
    )
    .map_err(|e| (400, e.to_string()))?;
    Ok((value, audit_id))
}

fn object_mut(value: &mut Value) -> Result<&mut Map<String, Value>, String> {
    value
        .as_object_mut()
        .ok_or_else(|| "payload must be an object".into())
}
fn array_mut_named<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, String> {
    object_mut(value)?
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("missing array: {key}"))
}
fn id_of(value: &Value) -> Option<&str> {
    value.get("id").and_then(Value::as_str)
}
fn required_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("missing {key}"))
}
fn now() -> String {
    timestamp()
}
fn new_entity_id(prefix: &str) -> String {
    format!("{prefix}_{}", unique_suffix())
}

fn create_loop_card(value: &mut Value, input: &Value) -> Result<(), String> {
    let lists = value
        .get("lists")
        .and_then(Value::as_array)
        .ok_or("loop lists are missing")?;
    let list_id = input
        .get("listId")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| lists.first().and_then(id_of).map(str::to_owned))
        .ok_or("missing listId")?;
    if !lists
        .iter()
        .any(|item| id_of(item) == Some(list_id.as_str()))
    {
        return Err(format!("list not found: {list_id}"));
    }
    let cards = array_mut_named(value, "cards")?;
    let order = cards
        .iter()
        .filter(|card| card.get("listId").and_then(Value::as_str) == Some(list_id.as_str()))
        .count() as i64;
    let created = now();
    let title = required_string(input, "title")?;
    cards.push(json!({"id":new_entity_id("card"),"listId":list_id,"title":title,"description":input.get("description").and_then(Value::as_str).unwrap_or_default(),"statusId":input.get("statusId").cloned().unwrap_or(Value::Null),"labelIds":input.get("labelIds").cloned().unwrap_or_else(|| json!([])),"links":input.get("links").cloned().unwrap_or_else(|| json!([])),"order":order,"createdAt":created,"updatedAt":null,"startedAt":null,"completedAt":null,"statusChangedAt":null,"archivedAt":null,"deletedAt":null}));
    Ok(())
}

fn find_card_mut<'a>(value: &'a mut Value, id: &str) -> Result<&'a mut Value, String> {
    array_mut_named(value, "cards")?
        .iter_mut()
        .find(|card| id_of(card) == Some(id))
        .ok_or_else(|| format!("card not found: {id}"))
}
fn update_loop_card(value: &mut Value, id: &str, input: &Value) -> Result<(), String> {
    let card = find_card_mut(value, id)?;
    let object = card.as_object_mut().ok_or("card must be object")?;
    let old_status = object.get("statusId").cloned();
    let mut changed = false;
    for key in ["title", "description", "statusId", "labelIds", "links"] {
        if let Some(next) = input.get(key) {
            object.insert(key.into(), next.clone());
            changed = true;
        }
    }
    if input.get("statusId").is_some() && old_status != input.get("statusId").cloned() {
        object.insert("statusChangedAt".into(), Value::String(now()));
    }
    if changed {
        object.insert("updatedAt".into(), Value::String(now()));
    }
    Ok(())
}
fn list_role_json(list: &Value) -> Option<&str> {
    list.get("role").and_then(Value::as_str).or_else(|| {
        let id = id_of(&list)?;
        let name = list
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase();
        if id == "list_done" || name == "done" || name == "完成" {
            Some("done")
        } else if id == "list_archive" || name == "archive" || name == "归档" {
            Some("archive")
        } else if id == "list_trash" || name == "trash" || name == "回收站" || name == "垃圾箱"
        {
            Some("trash")
        } else {
            None
        }
    })
}
fn move_loop_card_json(value: &mut Value, id: &str, input: &Value) -> Result<(), String> {
    let to_list = required_string(input, "listId")?;
    let index = input
        .get("index")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX) as usize;
    let lists = value
        .get("lists")
        .and_then(Value::as_array)
        .ok_or("loop lists are missing")?
        .clone();
    let target_role = lists
        .iter()
        .find(|item| id_of(item) == Some(to_list.as_str()))
        .and_then(list_role_json)
        .ok_or_else(|| format!("list not found: {to_list}"))?
        .to_owned();
    let cards = array_mut_named(value, "cards")?;
    let position = cards
        .iter()
        .position(|card| id_of(card) == Some(id))
        .ok_or_else(|| format!("card not found: {id}"))?;
    let current = cards[position].clone();
    let completed = current.get("completedAt").and_then(Value::as_str).is_some();
    if completed && !["done", "archive", "trash"].contains(&target_role.as_str()) {
        return Err("completed cards cannot be reopened; create a new card".into());
    }
    let mut moved = cards.remove(position);
    let old_list = moved
        .get("listId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    moved["listId"] = Value::String(to_list.clone());
    let timestamp = now();
    moved["updatedAt"] = Value::String(timestamp.clone());
    if target_role == "done" && moved.get("completedAt").and_then(Value::as_str).is_none() {
        moved["completedAt"] = Value::String(timestamp.clone());
    }
    if !["done", "archive", "trash"].contains(&target_role.as_str())
        && moved.get("startedAt").and_then(Value::as_str).is_none()
        && old_list != to_list
    {
        moved["startedAt"] = Value::String(timestamp.clone());
    }
    moved["order"] = json!(index);
    moved["archivedAt"] = if target_role == "archive" {
        Value::String(timestamp.clone())
    } else {
        Value::Null
    };
    moved["deletedAt"] = if target_role == "trash" {
        Value::String(timestamp.clone())
    } else {
        Value::Null
    };
    let mut same: Vec<Value> = cards
        .iter()
        .filter(|card| card.get("listId").and_then(Value::as_str) == Some(to_list.as_str()))
        .cloned()
        .collect();
    let at = index.min(same.len());
    same.insert(at, moved);
    let mut n = 0i64;
    for card in cards
        .iter_mut()
        .filter(|card| card.get("listId").and_then(Value::as_str) == Some(to_list.as_str()))
    {
        card["order"] = json!(n);
        n += 1;
    }
    let moved_card = same
        .into_iter()
        .find(|card| id_of(card) == Some(id))
        .unwrap();
    cards.push(moved_card);
    // Rebuild all order values and preserve list grouping; this is deliberately simple for a local board.
    let mut groups: std::collections::HashMap<String, Vec<Value>> =
        std::collections::HashMap::new();
    for card in cards.drain(..) {
        groups
            .entry(
                card.get("listId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .into(),
            )
            .or_default()
            .push(card);
    }
    let mut rebuilt = Vec::new();
    for list in lists {
        if let Some(list_id) = id_of(&list) {
            if let Some(mut group) = groups.remove(list_id) {
                group.sort_by_key(|c| c.get("order").and_then(Value::as_i64).unwrap_or(0));
                for (i, mut card) in group.into_iter().enumerate() {
                    card["order"] = json!(i as i64);
                    rebuilt.push(card);
                }
            }
        }
    }
    for (_, group) in groups {
        rebuilt.extend(group);
    }
    *cards = rebuilt;
    Ok(())
}
fn delete_loop_card(value: &mut Value, id: &str) -> Result<(), String> {
    let trash = value
        .get("lists")
        .and_then(Value::as_array)
        .and_then(|lists| {
            lists
                .iter()
                .find(|list| list_role_json(list) == Some("trash"))
        })
        .and_then(id_of)
        .map(str::to_owned);
    if let Some(trash) = trash {
        move_loop_card_json(value, id, &json!({"listId":trash,"index":u64::MAX}))
    } else {
        let cards = array_mut_named(value, "cards")?;
        let before = cards.len();
        cards.retain(|card| id_of(card) != Some(id));
        if before == cards.len() {
            Err(format!("card not found: {id}"))
        } else {
            Ok(())
        }
    }
}

fn create_atlas_category(value: &mut Value, input: &Value) -> Result<(), String> {
    let name = required_string(input, "name")?;
    array_mut_named(value, "categories")?
        .push(json!({"id":new_entity_id("category"),"name":name,"links":[]}));
    Ok(())
}
fn find_category_mut<'a>(value: &'a mut Value, id: &str) -> Result<&'a mut Value, String> {
    array_mut_named(value, "categories")?
        .iter_mut()
        .find(|x| id_of(x) == Some(id))
        .ok_or_else(|| format!("category not found: {id}"))
}
fn update_atlas_category(value: &mut Value, id: &str, input: &Value) -> Result<(), String> {
    let category = find_category_mut(value, id)?;
    if let Some(name) = input.get("name") {
        category["name"] = name.clone();
    }
    Ok(())
}
fn delete_atlas_category(value: &mut Value, id: &str) -> Result<(), String> {
    let categories = array_mut_named(value, "categories")?;
    let before = categories.len();
    categories.retain(|x| id_of(x) != Some(id));
    if before == categories.len() {
        Err(format!("category not found: {id}"))
    } else {
        Ok(())
    }
}
fn create_atlas_link(value: &mut Value, input: &Value) -> Result<(), String> {
    let category = required_string(input, "categoryId")?;
    if !value
        .get("categories")
        .and_then(Value::as_array)
        .is_some_and(|x| x.iter().any(|c| id_of(c) == Some(category.as_str())))
    {
        return Err(format!("category not found: {category}"));
    }
    let title = required_string(input, "title")?;
    let url = required_string(input, "url")?;
    let cats = array_mut_named(value, "categories")?;
    let cat = cats
        .iter_mut()
        .find(|x| id_of(x) == Some(category.as_str()))
        .unwrap();
    cat.get_mut("links")
        .and_then(Value::as_array_mut)
        .unwrap()
        .push(json!({"id":new_entity_id("link"),"title":title,"url":url}));
    Ok(())
}
fn find_atlas_link_mut<'a>(value: &'a mut Value, id: &str) -> Result<&'a mut Value, String> {
    for category in array_mut_named(value, "categories")?.iter_mut() {
        if let Some(link) = category
            .get_mut("links")
            .and_then(Value::as_array_mut)
            .and_then(|links| links.iter_mut().find(|x| id_of(x) == Some(id)))
        {
            return Ok(link);
        }
    }
    Err(format!("link not found: {id}"))
}
fn update_atlas_link(value: &mut Value, id: &str, input: &Value) -> Result<(), String> {
    let link = find_atlas_link_mut(value, id)?;
    for key in ["title", "url"] {
        if let Some(next) = input.get(key) {
            link[key] = next.clone();
        }
    }
    Ok(())
}
fn delete_atlas_link(value: &mut Value, id: &str) -> Result<(), String> {
    for category in array_mut_named(value, "categories")?.iter_mut() {
        let links = category
            .get_mut("links")
            .and_then(Value::as_array_mut)
            .unwrap();
        let before = links.len();
        links.retain(|x| id_of(x) != Some(id));
        if before != links.len() {
            return Ok(());
        }
    }
    Err(format!("link not found: {id}"))
}
fn move_atlas_link(value: &mut Value, id: &str, input: &Value) -> Result<(), String> {
    let target = required_string(input, "categoryId")?;
    let index = input
        .get("index")
        .and_then(Value::as_u64)
        .unwrap_or(u64::MAX) as usize;
    let cats = array_mut_named(value, "categories")?;
    let mut found = None;
    for category in cats.iter_mut() {
        let links = category
            .get_mut("links")
            .and_then(Value::as_array_mut)
            .unwrap();
        if let Some(pos) = links.iter().position(|x| id_of(x) == Some(id)) {
            found = Some(links.remove(pos));
            break;
        }
    }
    let link = found.ok_or_else(|| format!("link not found: {id}"))?;
    let category = cats
        .iter_mut()
        .find(|x| id_of(x) == Some(target.as_str()))
        .ok_or_else(|| format!("category not found: {target}"))?;
    let links = category
        .get_mut("links")
        .and_then(Value::as_array_mut)
        .unwrap();
    links.insert(index.min(links.len()), link);
    Ok(())
}
