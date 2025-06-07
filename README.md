
<p align="center">
  <img src="https://raw.githubusercontent.com/kaigouthro/Pine-Script-VS-Code/main/media/PineLogo.png" alt="Pine Script Logo" width="128">
</p>

<h1 align="center">Pine Script Language Server</h1>

<p align="center">
  <strong>The definitive Visual Studio Code extension for Pine Script™ development.</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=kaigouthro.pinescript-vscode">
    <img src="https://img.shields.io/visual-studio-marketplace/v/kaigouthro.pinescript-vscode?style=for-the-badge&label=VS%20Marketplace&color=0078d7" alt="VS Marketplace Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=kaigouthro.pinescript-vscode">
    <img src="https://img.shields.io/visual-studio-marketplace/d/kaigouthro.pinescript-vscode?style=for-the-badge&color=blue" alt="VS Marketplace Downloads">
  </a>
  <a href="https://github.com/kaigouthro/Pine-Script-VS-Code/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/kaigouthro/Pine-Script-VS-Code?style=for-the-badge&color=brightgreen" alt="License">
  </a>
</p>

This extension provides a rich set of language support features for [Pine Script™](https://www.tradingview.com/pine-script-docs), the programming language for creating custom indicators and strategies on TradingView. It leverages real-time linting via TradingView's API and combines it with powerful local parsing to deliver an intelligent and responsive coding experience.

## 📋 Requirements

*   **VS Code**: Version `1.96.0` or newer.
*   **[ErrorLens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) Extension**: This extension is highly recommended for the best experience, as it's used to display linting errors and warnings inline.

## ✨ Features

### Syntax Highlighting & Themes

*   **Advanced Syntax Highlighting**: Detailed and accurate syntax grammar for all Pine Script keywords, types, functions, and operators.
*   **Embedded Highlighting**: Pine Script code blocks within Markdown files (`.md`) are also highlighted correctly. (Not in md Preview however.)
*   **Extensive Theme Collection**: Comes bundled with over **20 custom themes** designed for Pine Script, including a variety of dark and light options like `Pine-Preferred`, `Pine-V4-Classic`, and `Pine-1980`, extended schemes that work well across other languages as well.

### IntelliSense & Code Assistance

*   **Advanced Autocompletion**:
    *   **Built-in & User-Defined Symbols**: Get suggestions for all built-in and user-defined functions, variables, constants, and User-Defined Types (UDTs).
    *   **Context-Aware Methods**: Receive type-aware suggestions for methods (e.g., `array.push()`, `table.cell()`).
    *   **Argument Completions**: Get suggestions for function parameter names and valid values (e.g., `plot.style` options).
    *   **UDT Support**: Autocompletes UDT constructors (`MyType.new(...)`) and their fields (`myInstance.fieldName`).
    *   **Typo Tolerance**: A fuzzy-matching algorithm provides suggestions even with minor typos.
*   **Inline "Ghost Text" Completions**: Subtle, single-line suggestions for functions and arguments appear directly in your editor as you type.
*   **Signature Help (Parameter Info)**: A tooltip appears as you type a function call, showing its parameters, documentation, and highlighting the active one. Supports function overloads.
*   **Rich Hover Information**: Hover over any symbol (function, variable, etc.) to get detailed information, including syntax, a full description, parameter details, and a link to the official documentation.
*   **Library Import Support**:
    *   **Library Completion**: Autocompletes library import paths (e.g., `import johndoe/MyLibrary/1`).
    *   **Library Hover**: Hover over an `import` statement to see the library's details and source code.

### Code Analysis & Quality

*   **Real-time Linting**:
    *   Errors and warnings are detected as you type, powered by the engine behind the TradingView Pine Editor.
    *   Issues are underlined and displayed inline (via ErrorLens) and listed in the "Problems" panel.
    *   Supports Pine Script `v5` and `v6`.
*   **Local Code Parsing**: The extension maintains an in-memory model of your code, parsing user-defined functions, types (UDTs), and docstrings (`@function`, `@param`) for intelligent features without needing to save.

### Code Generation & Manipulation

*   **Docstring Generator**: Automatically generate structured documentation blocks for your functions, types, and enums with the `pine.docString` command.
*   **Code Templates**: Quickly start a new project with built-in templates for Indicators, Strategies, and Libraries.
*   **Typify (Experimental)**: The `pine.typify` command analyzes your code and automatically adds explicit type annotations to variable declarations where the type can be inferred.
*   **Rename Symbol (F2)**: Safely rename variables and functions within the current file. (Not yyet scope, but whole file)

### UI & Visual Enhancements

*   **Inline Color Picker**: A color swatch appears in the gutter for any Pine Script color literal. Clicking it opens a full color picker.
*   **Built-in Script Browser**: The `pine.getStandardList` command opens a menu to browse and open any of TradingView's built-in indicators.
*   **Context Menu Integration**: Right-click in the editor to quickly access relevant commands like generating docstrings or creating new scripts.

## 🚀 Commands

Access these via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) or the right-click context menu.

| Command | Title | Description |
| :--- | :--- | :--- |
| `pine.docString` | Generate Docstring | Generates a documentation block for the selected code. |
| `pine.typify` | Typify Variables | (Experimental) Adds explicit type annotations to variables. |
| `pine.getStandardList` | Open Built-in Script | Opens a searchable list of TradingView's built-in scripts. |
| `pine.getIndicatorTemplate`| New Indicator | Creates a new file from the basic Indicator template. |
| `pine.getStrategyTemplate`| New Strategy | Creates a new file from the basic Strategy template. |
| `pine.getLibraryTemplate` | New Library | Creates a new file from the basic Library template. |
| `pine.setUsername` | Set/Remove Username | Sets your TradingView username for use in templates. |

## 🛠️ Technical Overview

This extension is built with a modular architecture for maintainability and performance.

*   **`PineDocsManager`**: Manages all built-in documentation and integrates information parsed from the user's active code and imported libraries.
*   **`PineParser`**: A local parser using regular expressions to understand user-defined functions, types (UDTs), and enums in real-time.
*   **`PineRequest`**: An HTTP client responsible for all communication with the `pine-facade.tradingview.com` API for linting and library data.
*   **`PineLint`**: Orchestrates the linting process and displays diagnostics in the editor.
*   **`PineCompletionService`**: A centralized service that consolidates completion items from all sources before they are passed to the VS Code UI.
*   **Providers**: The extension registers individual providers for each of VS Code's language features (e.g., `PineHoverProvider`, `PineCompletionProvider`), which consume the services above.

