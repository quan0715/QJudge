import time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Using a fixed viewport helps standardize image output sizes.
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("Navigating to login page...")
        page.goto("http://localhost:5174/login")
        page.screenshot(path="debug_0_login.png")
        
        # Fill login form
        print("Logging in...")
        page.fill("#email", "teacher@example.com")
        page.fill("#password", "teacher123")
        page.screenshot(path="debug_1_filled.png")
        page.click("button[type='submit']")
        
        # Wait for dashboard to load
        page.wait_for_url("**/dashboard*")
        page.screenshot(path="debug_2_dashboard.png")
        
        print("Navigating to teacher contests page...")
        page.goto("http://localhost:5174/teacher/contests")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="debug_3_contests.png")
        
        # Wait for the table/page to load
        page.wait_for_selector("text=新增競賽", timeout=10000)
        time.sleep(1) # Extra stability for visual animations
        
        button = page.locator("text=新增競賽").first
        if not button.is_visible():
            button = page.get_by_role("button", name="新增競賽")
            
        box = button.bounding_box()
        
        print(f"Button bounding box: {box}")
        
        # Take screenshot
        screenshot_path = "raw_screenshot.png"
        page.screenshot(path=screenshot_path)
        
        print("Processing image with Pillow...")
        # Process image
        img = Image.open(screenshot_path)
        draw = ImageDraw.Draw(img)
        
        # Draw red rectangle with 4px width around the button
        # box has x, y, width, height
        if box:
            pad = 12
            x0 = box["x"] - pad
            y0 = box["y"] - pad
            x1 = box["x"] + box["width"] + pad
            y1 = box["y"] + box["height"] + pad
            
            draw.rectangle([x0, y0, x1, y1], outline="red", width=4)
            
            # Add text label
            text = "Click here to Create Exam"
            try:
                # Try to load a larger system font (default might be very small)
                # On macOS, Helvetica or SF are usually available.
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
            except IOError:
                try:
                    # Fallback to general Arial if Helvetica isn't there
                    font = ImageFont.truetype("Arial.ttf", 28)
                except IOError:
                    # Final fallback to default if no specific ttf is found
                    font = ImageFont.load_default()
            
            # Using textbbox to center or place text better
            text_bbox = draw.textbbox((0, 0), text, font=font)
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            
            # Draw text above the box
            draw.text((x0, y0 - text_height - 15), text, fill="red", font=font)
        
        final_path = "create_exam_tutorial.png"
        img.save(final_path)
        print(f"Saved tutorial image to {final_path}")
        
        browser.close()

if __name__ == "__main__":
    main()
