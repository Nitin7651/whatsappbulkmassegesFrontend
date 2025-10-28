import threading
import time
from pathlib import Path
import sys
import logging
from datetime import datetime # <-- 1. ADD THIS IMPORT

# --- Flask and CORS Imports ---
from flask import Flask, request, jsonify
from flask_cors import CORS # Import CORS

# --- Selenium Imports ---
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# --- Configuration ---
new_msg_time = 5
send_msg_time = 5
country_code = 91
action_time = 2
image_path = 'image.png'

# --- Paths ---
BASE = Path(__file__).resolve().parent
MSG_FILE = BASE / "message.txt"
NUMS_FILE = BASE / "numbers.txt"
IMAGE_FILE = BASE / image_path if image_path else None
SESSION_DIR = BASE / "whatsapp_session"
HISTORY_LOG_FILE = BASE / "history.log" # <-- 2. ADD THIS NEW PATH

# --- Setup Flask App ---
app = Flask(__name__)
# Suppress INFO logs from Flask for a cleaner terminal
log = logging.getLogger('werkzeug')
log.setLevel(logging.WARNING)

CORS(app) 

# --- 3. NEW LOGGING FUNCTION ---
def log_status(number, status, message="N/A"):
    """Appends a new entry to the history.log file."""
    try:
        # Create a short summary of the message
        msg_summary = message.replace('\n', ' ').strip()
        if len(msg_summary) > 40:
            msg_summary = msg_summary[:37] + "..."
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"{timestamp} | {number} | {status} | {msg_summary}\n"
        
        # 'a' means append to the file
        with open(HISTORY_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Failed to write to log: {e}")


# --- 4. MODIFIED SELENIUM LOGIC ---
# (Now uses log_status() instead of print())
def run_selenium_logic(msg, numbers_str):
    print("--- Starting WhatsApp script ---")
    numbers = [n.strip() for n in numbers_str.splitlines() if n.strip()]
    if not numbers:
        print("No numbers provided.")
        return

    driver = None
    try:
        chrome_options = Options()
        chrome_options.add_argument(f"user-data-dir={SESSION_DIR.resolve()}")
        
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        driver.maximize_window()
        driver.get('https://web.whatsapp.com') 
        print("Waiting for WhatsApp to load...")

        try:
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.XPATH, '//div[@id="pane-side"]'))
            )
        except Exception:
            print("--- LOGIN FAILED (or took too long) ---")
            driver.quit()
            return
        
        print("Logged in! Starting to send messages...")
        
        image_to_send = IMAGE_FILE and IMAGE_FILE.exists()

        for num in numbers:
            num_digits = ''.join(ch for ch in num if ch.isdigit())
            link = f'https://web.whatsapp.com/send/?phone={country_code}{num_digits}&text='
            driver.get(link)
            
            try:
                WebDriverWait(driver, 15).until(
                    EC.any_of(
                        EC.presence_of_element_located((By.XPATH, '//div[@data-lexical-editor="true"][@role="textbox"]')),
                        EC.presence_of_element_located((By.XPATH, '//div[@data-testid="popup-controls-ok"]'))
                    )
                )
                
                try:
                    invalid_num_popup_ok_btn = driver.find_element(By.XPATH, '//div[@data-testid="popup-controls-ok"]')
                    print(f"❌ {num} is not a valid WhatsApp number. Skipping.")
                    log_status(num, "Invalid Number") # <-- LOGGING
                    invalid_num_popup_ok_btn.click()
                    time.sleep(1) 
                    continue
                except:
                    print(f"Chat box found for {num}. Proceeding...")
                    pass

            except Exception as e:
                print(f"Chat not ready for {num}. Skipping. Error: {e}")
                log_status(num, "Chat Not Ready") # <-- LOGGING
                continue

            image_attached = False 
            if image_to_send:
                try:
                    attach_btn = WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, 'span[data-icon="clip"]'))
                    )
                    attach_btn.click()
                    time.sleep(action_time)

                    file_input = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, '//input[@accept="image/*,video/mp4,video/3gpp,video/quicktime"]'))
                    )
                    file_input.send_keys(str(IMAGE_FILE.resolve()))
                    
                    WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, '//span[@data-testid="send"]'))
                    )
                    image_attached = True 
                    print(f"Image attached for {num}.")
                    
                except Exception as e:
                    print(f"Image upload failed for {num}: {e}")
                    log_status(num, "Image Upload Fail") # <-- LOGGING
                    image_attached = False 

            try:
                input_box = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, '//div[@data-lexical-editor="true"][@role="textbox"]'))
                )

                actions = ActionChains(driver)
                for i, line in enumerate(msg.splitlines()):
                    actions.send_keys(line)
                    if i != len(msg.splitlines()) - 1:
                        actions.key_down(Keys.SHIFT).send_keys(Keys.ENTER).key_up(Keys.SHIFT)
                
                if image_attached:
                    actions.perform()
                    driver.find_element(By.XPATH, '//span[@data-testid="send"]').click()
                else:
                    actions.send_keys(Keys.ENTER)
                    actions.perform()

                print(f"✅ Message sent to {num}")
                log_status(num, "Success", msg) # <-- LOGGING
                time.sleep(send_msg_time)

            except Exception as e:
                print(f"❌ Failed to send message to {num}: {e}")
                log_status(num, "Send Fail", msg) # <-- LOGGING
        
        print("--- All messages sent successfully! ---")
    except Exception as e:
        print(f"--- AN ERROR OCCURRED --- \n{e}", file=sys.stderr)
    finally:
        if driver:
            driver.quit()
        print("Driver closed.")

# --- Flask Routes (The API Endpoints) ---

@app.route('/get-defaults', methods=['GET'])
def get_defaults():
    # ... (this function is unchanged)
    try:
        msg = "Hello,\nThis is a sample message.\nRegards."
        if MSG_FILE.exists():
            msg = MSG_FILE.read_text(encoding="utf-8")
        
        nums = "9876543210\n9123456789"
        if NUMS_FILE.exists():
            nums = NUMS_FILE.read_text(encoding="utf-8")
            
        return jsonify({"default_message": msg, "default_numbers": nums})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- 5. NEW API ENDPOINT FOR HISTORY ---
@app.route('/get-history', methods=['GET'])
def get_history():
    """Reads the log file and returns it as a list of JSON objects."""
    if not HISTORY_LOG_FILE.exists():
        return jsonify([]) # Return empty list if no history
    
    logs = []
    try:
        with open(HISTORY_LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        for line in reversed(lines): # Show newest logs first
            if not line.strip():
                continue
            parts = line.split(' | ')
            if len(parts) == 4:
                logs.append({
                    "timestamp": parts[0].strip(),
                    "number": parts[1].strip(),
                    "status": parts[2].strip(),
                    "message": parts[3].strip()
                })
        return jsonify(logs)
    except Exception as e:
        print(f"Error reading log file: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/run-script', methods=['POST'])
def run_script():
    # ... (this function is unchanged)
    try:
        data = request.json
        msg_content = data['message']
        nums_content = data['numbers']

        if not msg_content.strip() or not nums_content.strip():
            return jsonify({"status": "error", "message": "Message and Numbers fields cannot be empty."}), 400

        try:
            MSG_FILE.write_text(msg_content, encoding="utf-8")
            NUMS_FILE.write_text(nums_content, encoding="utf-8")
        except Exception as e:
            print(f"Warning: Could not save text to files: {e}")

        print("Received request, starting new thread for Selenium...")
        # We pass msg_content to the thread so it can be logged
        threading.Thread(
            target=run_selenium_logic,
            args=(msg_content, nums_content),
            daemon=True
        ).start()
        
        return jsonify({"status": "success", "message": "Script started! Check your terminal for progress."})

    except Exception as e:
        print(f"Error in /run-script: {e}", file=sys.stderr)
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500


# --- Start the Web Server ---
if __name__ == '__main__':
    print("--- WhatsApp API Server ---")
    print("Starting Flask API server on http://localhost:5000")
    print("This server *only* provides an API. It does not serve a webpage.")
    app.run(host='0.0.0.0', port=5000)