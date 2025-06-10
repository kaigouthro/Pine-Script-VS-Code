# Pine Script Linter

This project provides a Python script to lint Pine Script code using the TradingView API.

## Features

*   Validates Pine Script syntax.
*   Checks for common errors and warnings.
*   Uses the official TradingView linting endpoint.

## Prerequisites

*   Python 3.x
*   `requests` library

## Installation

1.  Clone this repository or download the `run_linter.py` script (it should be in the parent directory relative to this README).
2.  Install the `requests` library:
    ```bash
    pip install requests
    ```

## Usage

To lint a Pine Script file, run the `run_linter.py` script (from the parent directory) with the path to your Pine Script file as an argument:

```bash
python ../run_linter.py <path_to_pine_script_file>
```

For example, if you have `test_params.pine` in the parent directory:

```bash
python ../run_linter.py ../test_params.pine
```

The script will output a JSON object containing the linting results. If the script is valid, the `success` field will be `true`. If there are errors, `success` will be `false`, and an `error` object will provide details.

## Example

Consider the following Pine Script code (`../test_params.pine`):

```pinescript
//@version=5
indicator("My Function Test", overlay=true)

myFunction(param1, param2) =>
    param1 + param2

plot(myFunction(1, 2))
```

Running the linter from the `linter` directory:

```bash
python ../run_linter.py ../test_params.pine
```

Output:

```json
{
    "success": true,
    "result": {
        "version": "5",
        "scriptType": "indicator",
        "warnings": [],
        "ilTemplate": "..."
    }
}
```

## How it Works

The script sends the Pine Script code to the `https://pine-facade.tradingview.com/pine-facade/translate_light` endpoint. This is the same endpoint that the TradingView web editor uses for its linting and compilation services. The script then parses the JSON response and prints it to the console.

## Moving `run_linter.py`

If you move `run_linter.py` into this `linter` directory, you would then run it like this:

```bash
python run_linter.py <path_to_pine_script_file>
```
(Assuming the script to be linted is also in the `linter` directory or you provide a relative/absolute path to it).

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## Disclaimer

This linter relies on an undocumented TradingView API endpoint. This endpoint could change or be deprecated at any time, which might break the linter. Use it at your own risk.
