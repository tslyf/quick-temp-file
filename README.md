[Русский](README.ru.md) | English

# Quick Temp File

[![VS Code Version](https://img.shields.io/badge/vscode-^1.80.0-blue.svg)](https://code.visualstudio.com) [![Visual Studio Marketplace Version](https://img.shields.io/vscode-marketplace/v/slyf.quick-temp-file.svg)](https://marketplace.visualstudio.com/items?itemName=slyf.quick-temp-file) [![Visual Studio Marketplace Installs](https://img.shields.io/vscode-marketplace/i/slyf.quick-temp-file.svg)](https://marketplace.visualstudio.com/items?itemName=slyf.quick-temp-file)

Visual Studio Code extension that allows you to quickly create or open temporary files. Forget manually creating files for notes, code snippets, or temporary data!

## Usage

### 1. Create or Open File... (Interactive Command)

* **Command:** `Quick Temp File: Create or Open File...`
* **What it does:** Opens a dialog to create or select a file.

*Demonstration:*

![Quick Temp File](images/demo.gif)

### 2. Create Instant File (No-Dialog Command)

* **Command:** `Quick Temp File: Create Instant File`
* **What it does:** **Instantly** creates and opens a new temporary file with a unique random name (UUID) and the default extension.

## Extension Settings

* **`quickTempFile.cleanupStrategy`**: Defines when temporary files should be automatically deleted.
  * `"never"` (Default): Never delete files.
  * `"onEditorClose"`: Delete a file as soon as its editor tab is closed.
  * `"onWindowClose"`: Delete all files created during the session when the VS Code window is closed.
* **`quickTempFile.defaultPath`**: The default directory for creating temporary files. (Default: system's temporary directory).
* **`quickTempFile.defaultExtension`**: The default file extension. (Default: `.txt`).

## For Developers (API)

The extension exposes a internal command for programmatic use in other extensions, `tasks.json`, or advanced `keybindings.json` setups.

* **Command ID:** `quickTempFile.api.create`
* **Arguments:** `(args: object)`

The `args` object can contain the following fields:

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `noDialog` | `boolean` | `false` | If `true`, the file is created immediately without a dialog. |
| `filename` | `string` | `undefined` | A specific name for the new file. Implies `noDialog: true`. |
| `content` | `string` | `undefined` | Initial content for the new file. |
| `directory`| `string \| null` | `undefined`| Overrides the default directory. `null` uses the system temp folder. |
| `extension`| `string` | `undefined` | Overrides the default file extension. |
| `quiet` | `boolean` | `false` | If `true`, suppresses all non-error success notifications (e.g., 'File created'). |
| `contentFromClipboard` |	`boolean` |	`false` |	If true, the file content will be read from the system clipboard. Overrides `content`. |

#### Usage Examples

**Create a file with content via `keybindings.json`:**
```json
{
  "key": "ctrl+alt+s",
  "command": "quickTempFile.api.create",
  "args": {
    "filename": "my-snippet.js",
    "content": "console.log('My Snippet');"
  }
}
```

**A completely silent API call from another extension (TypeScript):**
```typescript
// Create a file instantly, with no dialogs and no success popups.
// Errors will still be shown.
await vscode.commands.executeCommand('quickTempFile.api.create', {
  noDialog: true,
  quiet: true,
  content: 'This was created silently.'
});
```