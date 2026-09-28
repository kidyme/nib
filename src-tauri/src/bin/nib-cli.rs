use nib_lib::agent_store::{self, Dataset};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    if let Err(error) = run() {
        eprintln!("nib-cli: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let (data_dir, args) = parse_global_args(std::env::args().skip(1).collect())?;
    let Some((area, command_args)) = args.split_first() else {
        return Err(help());
    };

    if matches!(area.as_str(), "help" | "--help" | "-h") {
        println!("{}", help());
        return Ok(());
    }

    let result = match area.as_str() {
        "skill" => skill_manifest(data_dir.as_deref()),
        "loop" => run_loop(command_args, data_dir.as_deref()),
        "atlas" => run_atlas(command_args, data_dir.as_deref()),
        _ => Err(format!("unknown command: {area}\n\n{}", help())),
    }?;

    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn help() -> String {
    r#"Usage:
  nib-cli skill
  nib-cli loop list
  nib-cli loop create --title TITLE [--list LIST_ID]
  nib-cli loop update CARD_ID [--title TITLE] [--description TEXT] [--status STATUS_ID]
  nib-cli loop move CARD_ID --list LIST_ID [--index N]
  nib-cli loop delete CARD_ID
  nib-cli loop audit-logs
  nib-cli atlas list
  nib-cli atlas create-category --name NAME
  nib-cli atlas update-category CATEGORY_ID --name NAME
  nib-cli atlas delete-category CATEGORY_ID
  nib-cli atlas create-link --category CATEGORY_ID --title TITLE --url URL
  nib-cli atlas update-link LINK_ID [--title TITLE] [--url URL]
  nib-cli atlas delete-link LINK_ID
  nib-cli atlas move-link LINK_ID --category CATEGORY_ID [--index N]
  nib-cli atlas audit-logs

Global:
  --data-dir PATH   Override Nib's shared data directory

All successful commands print JSON. Errors go to stderr and exit 1.
"#
    .to_string()
}

fn parse_global_args(args: Vec<String>) -> Result<(Option<PathBuf>, Vec<String>), String> {
    let mut data_dir = None;
    let mut rest = Vec::new();
    let mut index = 0;
    while index < args.len() {
        if args[index] == "--data-dir" {
            let value = args.get(index + 1).ok_or("--data-dir needs a path")?;
            data_dir = Some(PathBuf::from(value));
            index += 2;
        } else {
            rest.push(args[index].clone());
            index += 1;
        }
    }
    Ok((data_dir, rest))
}

fn skill_manifest(data_dir: Option<&Path>) -> Result<Value, String> {
    let data_dir = data_dir
        .map(Path::to_path_buf)
        .or_else(|| agent_store::data_dir(None).ok());
    if let Some(data_dir) = data_dir {
        if let Ok(body) = request(&data_dir, "GET", "/api/v1/skill", None) {
            return serde_json::from_str(&body)
                .map_err(|error| format!("invalid server response: {error}"));
        }
    }
    Ok(json!({
        "name": "nib",
        "description": "Read and update Nib Loop and Atlas data.",
        "transport": "http",
        "requires": "Nib must be running so nib-cli can connect to its local HTTP server.",
        "prompt": "Use nib-cli to read and update the user's local Nib data. Prefer list before mutation, use stable IDs, and treat move/move-link as zero-based semantic drag operations. Return concise JSON-backed results and never invent IDs.",
        "commands": {
            "loop": ["list", "create", "update", "move", "delete"],
            "atlas": ["list", "create-category", "update-category", "delete-category", "create-link", "update-link", "delete-link", "move-link"]
        },
        "notes": [
            "All mutations go through Nib's local HTTP server and are recorded in SQLite audit_log.",
            "move and move-link are semantic drag operations; index is zero-based.",
            "loop delete moves a card to the Trash list when one exists.",
            "Loop and Atlas export/import payloads keep the desktop JSON shape unchanged."
        ]
    }))
}

fn run_loop(args: &[String], data_dir: Option<&Path>) -> Result<Value, String> {
    let command = args.first().ok_or_else(help)?;
    if command == "audit-logs" {
        return Ok(serde_json::from_str(&request(
            &agent_store::data_dir(data_dir)?,
            "GET",
            "/api/v1/loop/audit-logs",
            None,
        )?)
        .map_err(|error| format!("invalid server response: {error}"))?);
    }
    let (mut data, dataset) = load(Dataset::Loop, data_dir)?;
    let result = match command.as_str() {
        "list" => json!(data),
        "create" => {
            let title = required_flag(args, "--title")?;
            let list_id = flag(args, "--list").unwrap_or_else(|| first_list_id(&data));
            let lists = array(&data, "lists")?;
            if find_by_id(lists, &list_id).is_none() {
                return Err(format!("loop list not found: {list_id}"));
            }
            let id = new_id("card");
            let now = now();
            let order = array(&data, "cards")?
                .iter()
                .filter(|card| card.get("listId").and_then(Value::as_str) == Some(list_id.as_str()))
                .count();
            let card = json!({
                "id": id,
                "listId": list_id,
                "title": title,
                "description": flag(args, "--description").unwrap_or_default(),
                "statusId": flag(args, "--status"),
                "labelIds": [],
                "links": [],
                "order": order,
                "createdAt": now,
                "statusChangedAt": Value::Null,
                "archivedAt": Value::Null,
                "deletedAt": Value::Null
            });
            array_mut(&mut data, "cards")?.push(card.clone());
            save(dataset, &data, data_dir)?;
            json!({"card": card})
        }
        "update" => {
            let id = positional(args, 1)?;
            let card = find_mut_by_id(array_mut(&mut data, "cards")?, id)?;
            let mut changed_status = false;
            if let Some(value) = flag(args, "--title") {
                set(card, "title", value);
            }
            if let Some(value) = flag(args, "--description") {
                set(card, "description", value);
            }
            if let Some(value) = flag(args, "--status") {
                changed_status = card.get("statusId") != Some(&Value::String(value.clone()));
                set(card, "statusId", value);
            }
            if changed_status {
                set(card, "statusChangedAt", now());
            }
            let result = card.clone();
            save(dataset, &data, data_dir)?;
            json!({"card": result})
        }
        "move" => {
            let id = positional(args, 1)?;
            let list_id = required_flag(args, "--list")?;
            let index = parse_index(args)?;
            move_loop_card(&mut data, id, &list_id, index)?;
            save(dataset, &data, data_dir)?;
            json!({"card": find_by_id(array(&data, "cards")?, id).cloned().ok_or("card disappeared")?})
        }
        "delete" => {
            let id = positional(args, 1)?;
            let trash_id = array(&data, "lists")?
                .iter()
                .find(|list| list.get("role") == Some(&Value::String("trash".into())))
                .and_then(|list| list.get("id"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            if let Some(trash_id) = trash_id {
                move_loop_card(&mut data, id, &trash_id, usize::MAX)?;
            } else {
                let cards = array_mut(&mut data, "cards")?;
                let before = cards.len();
                cards.retain(|card| card.get("id").and_then(Value::as_str) != Some(id));
                if cards.len() == before {
                    return Err(format!("card not found: {id}"));
                }
            }
            save(dataset, &data, data_dir)?;
            json!({"deleted": id})
        }
        _ => return Err(format!("unknown loop command: {command}\n\n{}", help())),
    };
    Ok(result)
}

fn run_atlas(args: &[String], data_dir: Option<&Path>) -> Result<Value, String> {
    let command = args.first().ok_or_else(help)?;
    if command == "audit-logs" {
        return Ok(serde_json::from_str(&request(
            &agent_store::data_dir(data_dir)?,
            "GET",
            "/api/v1/atlas/audit-logs",
            None,
        )?)
        .map_err(|error| format!("invalid server response: {error}"))?);
    }
    let (mut data, dataset) = load(Dataset::Atlas, data_dir)?;
    let result = match command.as_str() {
        "list" => json!(data),
        "create-category" => {
            let name = required_flag(args, "--name")?;
            let category = json!({"id": new_id("category"), "name": name, "links": []});
            array_mut(&mut data, "categories")?.push(category.clone());
            save(dataset, &data, data_dir)?;
            json!({"category": category})
        }
        "update-category" => {
            let id = positional(args, 1)?;
            let name = required_flag(args, "--name")?;
            let category = find_mut_by_id(array_mut(&mut data, "categories")?, id)?;
            set(category, "name", name);
            let result = category.clone();
            save(dataset, &data, data_dir)?;
            json!({"category": result})
        }
        "delete-category" => {
            let id = positional(args, 1)?;
            let categories = array_mut(&mut data, "categories")?;
            let before = categories.len();
            categories.retain(|category| category.get("id").and_then(Value::as_str) != Some(id));
            if categories.len() == before {
                return Err(format!("category not found: {id}"));
            }
            save(dataset, &data, data_dir)?;
            json!({"deleted": id})
        }
        "create-link" => {
            let category_id = required_flag(args, "--category")?;
            let title = required_flag(args, "--title")?;
            let url = normalize_url(&required_flag(args, "--url")?)?;
            let category = find_mut_by_id(array_mut(&mut data, "categories")?, &category_id)?;
            let links = category
                .get_mut("links")
                .and_then(Value::as_array_mut)
                .ok_or("category links must be an array")?;
            let link = json!({"id": new_id("link"), "title": title, "url": url});
            links.push(link.clone());
            save(dataset, &data, data_dir)?;
            json!({"link": link, "categoryId": category_id})
        }
        "update-link" => {
            let id = positional(args, 1)?;
            let title = flag(args, "--title");
            let url = flag(args, "--url")
                .map(|value| normalize_url(&value))
                .transpose()?;
            let link = find_atlas_link_mut(&mut data, id)?;
            if let Some(title) = title {
                set(link, "title", title);
            }
            if let Some(url) = url {
                set(link, "url", url);
            }
            let result = link.clone();
            save(dataset, &data, data_dir)?;
            json!({"link": result})
        }
        "delete-link" => {
            let id = positional(args, 1)?;
            let mut deleted = false;
            for category in array_mut(&mut data, "categories")? {
                let links = category
                    .get_mut("links")
                    .and_then(Value::as_array_mut)
                    .ok_or("category links must be an array")?;
                let before = links.len();
                links.retain(|link| link.get("id").and_then(Value::as_str) != Some(id));
                deleted |= links.len() != before;
            }
            if !deleted {
                return Err(format!("link not found: {id}"));
            }
            save(dataset, &data, data_dir)?;
            json!({"deleted": id})
        }
        "move-link" => {
            let id = positional(args, 1)?;
            let category_id = required_flag(args, "--category")?;
            let index = parse_index(args)?;
            move_atlas_link(&mut data, id, &category_id, index)?;
            save(dataset, &data, data_dir)?;
            json!({"linkId": id, "categoryId": category_id, "index": index})
        }
        _ => return Err(format!("unknown atlas command: {command}\n\n{}", help())),
    };
    Ok(result)
}

fn load(dataset: Dataset, data_dir: Option<&Path>) -> Result<(Value, Dataset), String> {
    let data_dir = agent_store::data_dir(data_dir)?;
    let path = format!("/api/v1/{}", dataset_name(dataset));
    let contents = request(&data_dir, "GET", &path, None)
        .map_err(|error| format!("cannot read Nib server: {error}"))?;
    let value = serde_json::from_str(&contents).map_err(|e| format!("invalid server JSON: {e}"))?;
    Ok((value, dataset))
}

fn save(dataset: Dataset, data: &Value, data_dir: Option<&Path>) -> Result<(), String> {
    let data_dir = agent_store::data_dir(data_dir)?;
    let contents = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    let path = format!("/api/v1/{}", dataset_name(dataset));
    request(&data_dir, "PUT", &path, Some(&contents)).map(|_| ())
}

fn dataset_name(dataset: Dataset) -> &'static str {
    match dataset {
        Dataset::Loop => "loop",
        Dataset::Atlas => "atlas",
    }
}

#[derive(Deserialize)]
struct Discovery {
    port: u16,
    token: String,
}

fn request(
    data_dir: &Path,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<String, String> {
    let discovery_path = data_dir.join("agent-server.json");
    let discovery: Discovery = serde_json::from_str(
        &std::fs::read_to_string(&discovery_path)
            .map_err(|_| "Nib is not running; start Nib first".to_string())?,
    )
    .map_err(|error| format!("invalid server discovery: {error}"))?;
    let mut stream = TcpStream::connect(("127.0.0.1", discovery.port))
        .map_err(|_| "Nib is not running; start Nib first".to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {}\r\nX-Nib-Actor: ai\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        discovery.token,
        body.len(),
        body,
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "invalid server response".to_string())?;
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "invalid server status".to_string())?;
    if !(200..300).contains(&status) {
        return Err(format!("server returned {status}: {body}"));
    }
    Ok(body.to_string())
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{key} must be an array"))
}

fn array_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, String> {
    value
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("{key} must be an array"))
}

fn find_by_id<'a>(items: &'a [Value], id: &str) -> Option<&'a Value> {
    items
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
}

fn find_mut_by_id<'a>(items: &'a mut [Value], id: &str) -> Result<&'a mut Value, String> {
    items
        .iter_mut()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
        .ok_or_else(|| format!("item not found: {id}"))
}

fn find_atlas_link_mut<'a>(data: &'a mut Value, id: &str) -> Result<&'a mut Value, String> {
    for category in array_mut(data, "categories")? {
        let links = category
            .get_mut("links")
            .and_then(Value::as_array_mut)
            .ok_or("category links must be an array")?;
        if let Some(link) = links
            .iter_mut()
            .find(|link| link.get("id").and_then(Value::as_str) == Some(id))
        {
            return Ok(link);
        }
    }
    Err(format!("link not found: {id}"))
}

fn set(value: &mut Value, key: &str, next: impl Into<Value>) {
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), next.into());
    }
}

fn first_list_id(data: &Value) -> String {
    array(data, "lists")
        .ok()
        .and_then(|lists| lists.first())
        .and_then(|list| list.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("list_todo")
        .to_string()
}

fn move_loop_card(
    data: &mut Value,
    card_id: &str,
    to_list_id: &str,
    requested_index: usize,
) -> Result<(), String> {
    let target_exists = array(data, "lists")?
        .iter()
        .any(|list| list.get("id").and_then(Value::as_str) == Some(to_list_id));
    if !target_exists {
        return Err(format!("loop list not found: {to_list_id}"));
    }

    let target_len = array(data, "cards")?
        .iter()
        .filter(|card| card.get("listId").and_then(Value::as_str) == Some(to_list_id))
        .count();
    let target_role = array(data, "lists")?
        .iter()
        .find(|list| list.get("id").and_then(Value::as_str) == Some(to_list_id))
        .and_then(|list| list.get("role"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let cards = array_mut(data, "cards")?;
    let source_index = cards
        .iter()
        .position(|card| card.get("id").and_then(Value::as_str) == Some(card_id))
        .ok_or_else(|| format!("card not found: {card_id}"))?;
    let mut card = cards.remove(source_index);
    let from_list = card
        .get("listId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let index = requested_index.min(target_len);
    let target_positions: Vec<usize> = cards
        .iter()
        .enumerate()
        .filter(|(_, item)| item.get("listId").and_then(Value::as_str) == Some(to_list_id))
        .map(|(i, _)| i)
        .collect();
    let insert_at = target_positions.get(index).copied().unwrap_or(cards.len());

    if from_list != to_list_id {
        set(&mut card, "listId", to_list_id.to_string());
        if target_role.as_deref() == Some("trash") {
            set(&mut card, "deletedAt", now());
        }
        if target_role.as_deref() == Some("archive") {
            set(&mut card, "archivedAt", now());
        }
    }
    cards.insert(insert_at, card);

    renumber_list(cards, to_list_id);
    if from_list != to_list_id {
        renumber_list(cards, &from_list);
    }
    Ok(())
}

fn renumber_list(cards: &mut [Value], list_id: &str) {
    let mut order = 0;
    for item in cards
        .iter_mut()
        .filter(|item| item.get("listId").and_then(Value::as_str) == Some(list_id))
    {
        set(item, "order", order);
        order += 1;
    }
}

fn move_atlas_link(
    data: &mut Value,
    link_id: &str,
    target_category_id: &str,
    requested_index: usize,
) -> Result<(), String> {
    let categories = array_mut(data, "categories")?;
    if !categories
        .iter()
        .any(|category| category.get("id").and_then(Value::as_str) == Some(target_category_id))
    {
        return Err(format!("category not found: {target_category_id}"));
    }
    let mut link = None;
    for category in categories.iter_mut() {
        let links = category
            .get_mut("links")
            .and_then(Value::as_array_mut)
            .ok_or("category links must be an array")?;
        if let Some(index) = links
            .iter()
            .position(|item| item.get("id").and_then(Value::as_str) == Some(link_id))
        {
            link = Some(links.remove(index));
            break;
        }
    }
    let link = link.ok_or_else(|| format!("link not found: {link_id}"))?;
    let target = categories
        .iter_mut()
        .find(|category| category.get("id").and_then(Value::as_str) == Some(target_category_id))
        .ok_or("target category disappeared")?;
    let links = target
        .get_mut("links")
        .and_then(Value::as_array_mut)
        .ok_or("category links must be an array")?;
    let index = requested_index.min(links.len());
    links.insert(index, link);
    Ok(())
}

fn parse_index(args: &[String]) -> Result<usize, String> {
    flag(args, "--index")
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "--index must be an integer".to_string())
        })
        .transpose()
        .map(|value| value.unwrap_or(usize::MAX))
}

fn positional(args: &[String], index: usize) -> Result<&str, String> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| "missing positional argument".to_string())
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn required_flag(args: &[String], name: &str) -> Result<String, String> {
    flag(args, name).ok_or_else(|| format!("missing {name}"))
}

fn normalize_url(value: &str) -> Result<String, String> {
    let url = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("https://{value}")
    };
    if url.contains(' ') {
        return Err("URL must not contain spaces".to_string());
    }
    Ok(url)
}

fn now() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}Z", iso_utc(seconds))
}

fn iso_utc(seconds: u64) -> String {
    let days = seconds / 86_400;
    let day_seconds = seconds % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000",
        day_seconds / 3600,
        (day_seconds / 60) % 60,
        day_seconds % 60
    )
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    (y + if m <= 2 { 1 } else { 0 }, m, d)
}

fn new_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{prefix}_{nanos:x}")
}
