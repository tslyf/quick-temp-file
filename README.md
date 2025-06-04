[Русский](README.ru.md) | English

# Quick Temp File

[![VS Code Version](https://img.shields.io/badge/vscode-^1.80.0-blue.svg)](https://code.visualstudio.com)

**Quick Temp File** is a Visual Studio Code extension that allows you to quickly create or open temporary files with a persistent history. Forget manually creating files for notes, code snippets, or temporary data!

## Usage

1.  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
2.  Type and select the command: `Quick Temp File: Create New File or Open Recent`.
3.  A menu will appear with the following options:
    * **Input Box (at the top):** You can type a new filename here.
        * If you type a name (e.g., `my_notes` or `script.js`) and press `Enter`:
            * If the name has no extension, the default extension (e.g., `.txt`) will be appended.
            * The file will be created in the configured default path if it doesn't exist, and then opened.
            * If a file with that name already exists in the default path, it will be opened directly.
        * If you type only the extension (for example, `.md`, `.txt`) and press `Enter`, a new file with a random name and the specified extension will be created.
    * **"New file with random name" item:** Select this item from the list to instantly create a new file with a unique random name (using UUID) and the default extension in the default path. The file will then be opened.
    * **Recent Files List:** Below the input and the random option, you'll see a list of recently created/opened temporary files.
        * Selecting an existing file from this list will open it.
        * If a file from the list has been deleted from your disk, it will be marked. Selecting it will prompt the extension to recreate the file at its original path and then open it.

4.  The chosen or created file will be opened in the editor, and your history will be updated.

## Extension Settings

* **`quickTempFile.deleteOnExit`**:
    * Specifies whether temporary files created *during the current session by this extension* should be deleted when VS Code exits.
    * **Default is `false`**.

* **`quickTempFile.defaultPath`**:
    * Specifies the default directory for creating temporary files.
    * **Default is empty, which means the system's temporary directory will be used** (e.g., `/tmp` on Linux/macOS, `%TEMP%` on Windows).

* **`quickTempFile.defaultExtension`**:
    * Specifies the default file extension (including the leading dot) to be appended if no extension is provided in the filename (e.g., when typing a new name or for random files).
    * **Default is `.txt`**.
