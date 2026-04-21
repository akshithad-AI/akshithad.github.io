from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless.False)
    page = browser.new_page()

    page.goto("https://the-internet.herokuapp.com/login")
    page.wait_for_selector("#username")

    page.fill("#username", "tomsmith")
    page.fill("#password", "SuperSecretPassword!")
    page.click("button[type='submit']")

    page.wait_for_selector("#flash")
    message = page.locator("#flash").inner_text()

    print("Success message:", message)

    assert "You logged into a secure area!" in message

    page.wait_for_timeout(3000)
    browser.close()