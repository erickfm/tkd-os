use tauri_plugin_sql::{Migration, MigrationKind};

/// Write text to a path the user explicitly chose via the OS Save dialog.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/0001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "belt_colors",
            sql: include_str!("../migrations/0002_belt_colors.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "guardians",
            sql: include_str!("../migrations/0003_guardians.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "testing_cycle",
            sql: include_str!("../migrations/0004_testing_cycle.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tkdos.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
