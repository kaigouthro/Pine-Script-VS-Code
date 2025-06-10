import json
import requests
import sys # Ensure sys is imported
from typing import Any, Dict, Optional

# --- Configuration ---
LINT_URL = "https://pine-facade.tradingview.com/pine-facade/translate_light?user_name=Guest&v=3"
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PineLinterMini/1.0"


def lint_pine_script(script_content: str, user_agent: str = DEFAULT_USER_AGENT) -> Optional[Dict[str, Any]]:
    if not isinstance(script_content, str):
        print("Error: script_content must be a string.", file=sys.stderr) #
        return None
    if not script_content.strip():
        print("Error: script_content cannot be empty.", file=sys.stderr) #
        return None

    headers = {
        "User-Agent": user_agent,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/"
    }
    data = {"source": script_content}

    try:
        response = requests.post(
            LINT_URL, headers=headers, data=data, timeout=20)
        response.raise_for_status()

        if 'application/json' in response.headers.get('Content-Type', ''):
            return response.json() # This is the successful JSON data
        else:
            print(
                f"Error: Unexpected content type '{response.headers.get('Content-Type')}'. Response text: {response.text[:200]}", file=sys.stderr) #
            return None

    except requests.exceptions.HTTPError as e:
        print(
            f"HTTP error during linting: {e.response.status_code} - {e.response.text[:200]}", file=sys.stderr) #
    except requests.exceptions.JSONDecodeError as e: # Corrected to check for response in local scope
        print(
            f"JSON decode error during linting: {e}. Response text: {response.text[:200] if 'response' in locals() else 'N/A'}", file=sys.stderr) #
    except requests.exceptions.RequestException as e:
        print(f"Request exception during linting: {e}", file=sys.stderr) #
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr) #
    return None

if __name__ == "__main__":
    # import sys # sys is already imported at the top
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        try:
            with open(file_path, 'r') as f:
                script_content = f.read()
            lint_result = lint_pine_script(script_content)
            if lint_result:
                print(json.dumps(lint_result, indent=4)) # JSON output to stdout
        except FileNotFoundError:
            print(f"Error: File not found at {file_path}", file=sys.stderr) #
        except Exception as e:
            print(f"An error occurred while processing the file: {e}", file=sys.stderr) #
    else:
        print("Usage: python run_linter.py <path_to_pine_script_file>", file=sys.stderr) #
EOF
