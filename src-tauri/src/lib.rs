//! Tauri 侧。
//!
//! 前端能自己搞定的事（配色、字体、布局）都放在前端；这里只补前端拿不到的
//! 系统信息。

use objc2_core_foundation::{CFArray, CFRetained, CFString};
use objc2_core_text::{
    kCTFontNameAttribute, kCTFontStyleNameAttribute, CTFont, CTFontCollection, CTFontDescriptor,
};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FontFace {
    post_script_name: String,
    family: String,
    style_name: String,
    display_name: String,
}

fn descriptor_string(descriptor: &CTFontDescriptor, attribute: &CFString) -> Option<String> {
    // SAFETY: the descriptor owns the returned value; it stays valid while copied.
    let value = unsafe { descriptor.localized_attribute(attribute, std::ptr::null_mut())? };
    value
        .downcast::<CFString>()
        .ok()
        .map(|value| value.to_string())
}

/// 本机所有可用 font face。PostScript 名是最终选择依据，family/style 只用于
/// 设置页展示和搜索。
#[tauri::command]
fn list_fonts() -> Vec<FontFace> {
    // SAFETY: CoreText owns the returned collection and descriptors.
    let collection = unsafe { CTFontCollection::from_available_fonts(None) };
    let Some(descriptors) = (unsafe { collection.matching_font_descriptors() }) else {
        return Vec::new();
    };
    // SAFETY: CTFontCollectionCreateMatchingFontDescriptors returns CTFontDescriptorRefs.
    let descriptors: CFRetained<CFArray<CTFontDescriptor>> =
        unsafe { CFRetained::cast_unchecked(descriptors) };

    let mut seen = BTreeSet::new();
    let mut faces = Vec::new();

    for descriptor in descriptors.iter() {
        let Some(post_script_name) =
            descriptor_string(&descriptor, unsafe { kCTFontNameAttribute })
        else {
            continue;
        };
        if !seen.insert(post_script_name.clone()) {
            continue;
        }

        // SAFETY: CoreText always returns a best-match font for a valid descriptor.
        let font = unsafe { CTFont::with_font_descriptor(&descriptor, 12.0, std::ptr::null()) };
        let family = unsafe { font.family_name() }.to_string();
        let style_name = descriptor_string(&descriptor, unsafe { kCTFontStyleNameAttribute })
            .unwrap_or_else(|| "Regular".to_string());
        let display_name = unsafe { font.display_name() }.to_string();

        faces.push(FontFace {
            post_script_name,
            family,
            style_name,
            display_name,
        });
    }

    faces.sort_by(|a, b| {
        a.family
            .to_lowercase()
            .cmp(&b.family.to_lowercase())
            .then_with(|| {
                a.style_name
                    .to_lowercase()
                    .cmp(&b.style_name.to_lowercase())
            })
            .then_with(|| a.post_script_name.cmp(&b.post_script_name))
    });
    faces
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_unique_font_faces() {
        let faces = list_fonts();
        let names: BTreeSet<_> = faces.iter().map(|face| &face.post_script_name).collect();

        assert!(!faces.is_empty());
        assert_eq!(names.len(), faces.len());
    }
}
