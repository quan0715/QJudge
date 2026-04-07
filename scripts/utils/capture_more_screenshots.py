import time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

def process_image(img_path, box, text, out_path, pad=12, text_offset=15):
    img = Image.open(img_path)
    if box:
        draw = ImageDraw.Draw(img)
        x0 = box["x"] - pad
        y0 = box["y"] - pad
        x1 = box["x"] + box["width"] + pad
        y1 = box["y"] + box["height"] + pad
        draw.rectangle([x0, y0, x1, y1], outline="red", width=4)
        
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
        except IOError:
            try:
                font = ImageFont.truetype("Arial.ttf", 32)
            except IOError:
                font = ImageFont.load_default()
        
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_height = text_bbox[3] - text_bbox[1]
        draw.text((x0, y0 - text_height - text_offset), text, fill="red", font=font)
    img.save(out_path)
    print(f"Saved {out_path}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        print("Navigating to login page...")
        page.goto("http://localhost:5174/login")
        
        print("Logging in...")
        page.fill("#email", "teacher@example.com")
        page.fill("#password", "teacher123")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard*")
        
        print("Navigating to teacher contests page...")
        page.goto("http://localhost:5174/teacher/contests")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=新增競賽", timeout=10000)
        time.sleep(1) 
        
        # 1. Create Exam Tutorial
        button1 = page.get_by_role("button", name="新增競賽").first
        box1 = button1.bounding_box()
        page.screenshot(path="raw_1.png")
        process_image("raw_1.png", box1, "Click here to Create Exam", "create_exam_tutorial_v2.png")
        
        # 2. Enable Exam Mode Settings
        print("Going into E2E Exam Mode Contest...")
        page.get_by_text("E2E Exam Mode Contest").click()
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=考試模式", timeout=10000)
        time.sleep(1)
        
        # We want to highlight the checkbox or the whole section "考試模式設定"
        # Let's find the text "啟用考試模式" and highlight it
        el2 = page.get_by_text("啟用考試模式").first
        box2 = el2.bounding_box()
        page.screenshot(path="raw_2.png")
        process_image("raw_2.png", box2, "Enable Exam Mode", "enable_exam_mode.png", pad=15)
        
        # 3. Navigate to Exam Questions
        print("Going to Exam Questions tab...")
        page.locator(".cds--side-nav__link").nth(3).click()
        page.wait_for_load_state("networkidle")
        
        button3 = page.get_by_role("button", name="新增題目").first
        button3.wait_for(state="visible", timeout=10000)
        time.sleep(1)
        
        box3 = button3.bounding_box()
        page.screenshot(path="raw_3.png")
        process_image("raw_3.png", box3, "Click to add question", "add_exam_question.png")
        
        # 4. Open Modal and capture Modal
        button3.click()
        
        el4 = page.get_by_label("選擇題目類型")
        el4.wait_for(state="visible", timeout=10000)
        time.sleep(1) # wait for modal animation
        
        box4 = el4.bounding_box()
        page.screenshot(path="raw_4.png")
        process_image("raw_4.png", box4, "Type your question here", "exam_question_modal.png", pad=10)
        
        browser.close()

if __name__ == "__main__":
    main()
