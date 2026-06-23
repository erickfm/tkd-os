use tauri_plugin_sql::{Migration, MigrationKind};

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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tkdos.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
