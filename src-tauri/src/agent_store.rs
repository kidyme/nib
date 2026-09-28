use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy)]
pub enum Dataset {
    Loop,
    Atlas,
}

impl Dataset {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "loop" => Ok(Self::Loop),
            "atlas" => Ok(Self::Atlas),
            _ => Err(format!("unknown dataset: {value}; expected loop or atlas")),
        }
    }

    fn filename(self) -> &'static str {
        match self {
            Self::Loop => "loop.json",
            Self::Atlas => "atlas.json",
        }
    }
}

/// Shared with the CLI and the desktop app. NIB_DATA_DIR is useful for tests and
/// for agents that intentionally operate on a copied data directory.
pub fn data_dir(override_dir: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = override_dir {
        return Ok(path.to_path_buf());
    }
    if let Some(path) = std::env::var_os("NIB_DATA_DIR") {
        return Ok(PathBuf::from(path));
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").ok_or_else(|| "HOME is not set".to_string())?;
        return Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("com.minhexiang.nib"));
    }

    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA").ok_or_else(|| "APPDATA is not set".to_string())?;
        return Ok(PathBuf::from(base).join("com.minhexiang.nib"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
            })
            .ok_or_else(|| "neither XDG_DATA_HOME nor HOME is set".to_string())?;
        Ok(base.join("com.minhexiang.nib"))
    }
}

pub fn path_for(dataset: Dataset, override_dir: Option<&Path>) -> Result<PathBuf, String> {
    Ok(data_dir(override_dir)?.join(dataset.filename()))
}

pub fn read(dataset: Dataset, override_dir: Option<&Path>) -> Result<Option<String>, String> {
    let path = path_for(dataset, override_dir)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("read {}: {error}", path.display())),
    }
}

/// Atomic replacement prevents the CLI from leaving a half-written JSON file.
pub fn write(dataset: Dataset, contents: &str, override_dir: Option<&Path>) -> Result<(), String> {
    let dir = data_dir(override_dir)?;
    fs::create_dir_all(&dir).map_err(|error| format!("create {}: {error}", dir.display()))?;
    let path = dir.join(dataset.filename());
    let temp = dir.join(format!(".{}.tmp", dataset.filename()));
    fs::write(&temp, contents).map_err(|error| format!("write {}: {error}", temp.display()))?;
    fs::rename(&temp, &path).map_err(|error| format!("replace {}: {error}", path.display()))
}
