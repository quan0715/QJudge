import os
import time
from playwright.sync_api import sync_playwright

def main():
    base_url = "http://localhost:5173"
    report_dir = ".gstack/design-reports/screenshots"
    os.makedirs(report_dir, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Phase 1: First Impression (Home/Login)
        print("Navigating to home page...")
        page.goto(base_url)
        time.sleep(2)
        page.screenshot(path=f"{report_dir}/first-impression.png", full_page=True)
        
        # Check if we need login
        if "/login" in page.url:
            print("Logging in...")
            page.fill("#email", "teacher@example.com")
            page.fill("#password", "teacher123")
            page.click("button[type='submit']")
            page.wait_for_url("**/dashboard*")
            page.screenshot(path=f"{report_dir}/dashboard.png", full_page=True)
        
        # Phase 3: Page-by-Page Audit (Affected pages)
        # 1. Teacher Contests
        print("Navigating to Teacher Contests...")
        page.goto(f"{base_url}/teacher/contests")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=f"{report_dir}/teacher-contests.png", full_page=True)
        
        # 2. Problems List
        print("Navigating to Problems List...")
        page.goto(f"{base_url}/teacher/problems")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=f"{report_dir}/teacher-problems.png", full_page=True)

        browser.close()
        print("Screenshots captured.")

if __name__ == "__main__":
    main()
