//! Tauri 侧。
//!
//! 前端能自己搞定的事（配色、字体、布局）都放在前端；这里只补前端拿不到的
//! 系统信息。

/// 本机已安装的字体族名，给设置页当候选。macOS 的 CoreText 返回的正好是
/// CSS `font-family` 认的名字，而且已经按界面显示顺序排好。
#[tauri::command]
fn list_fonts() -> Vec<String> {
    use objc2_core_foundation::{CFArray, CFRetained, CFString};

    // SAFETY: CoreText 保证返回非空，且元素全是 CFString。
    let families = unsafe { objc2_core_text::CTFontManagerCopyAvailableFontFamilyNames() };
    let families: CFRetained<CFArray<CFString>> = unsafe { CFRetained::cast_unchecked(families) };
    families.iter().map(|family| family.to_string()).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
