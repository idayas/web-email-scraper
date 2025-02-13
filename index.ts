import { chromium, Browser, Page } from 'playwright';
import { Database } from "bun:sqlite";

async function extractEmails(url: string): Promise<string[]> {
let browser: Browser | null = null;
    try {
        browser = await chromium.launch();
        const page: Page = await browser.newPage();
        page.setDefaultNavigationTimeout(5000)
        await page.goto(url);
        
        // Get the entire page content
        const content: string = await page.content();
        
        // Updated regex to find all email addresses, including those with spaces
        const emailPattern: RegExp = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}(?<!\.(png|jpg|jpeg|gif|bmp|webp))\b/g;
        const emails: string[] = content.match(emailPattern) || [];
        
        // Remove spaces from email addresses and ensure uniqueness
        const uniqueEmails = new Set(emails.map(email => email.replace(/\s/g, '')));
        
        return Array.from(uniqueEmails);
    } catch (error) {
        console.error('An error occurred:', error);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function searchPlacesQuery(query: string): string[] {
  const options = {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri',
      'Content-Type': 'application/json'
    },
    body: `{\n  "textQuery": "${query}",\n}`
  };


  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', options)
    const json = await response.json()
    return json;
  } catch (err) {
    console.error(err.message);
    return err;
  }
}

async function main() {
  const db = new Database("mydb.sqlite", {create: true});
  const googleQuery = prompt('Businesses to search:');
  console.log('Searching for:', googleQuery);
  const responses = await searchPlacesQuery(googleQuery);
  const urls = responses.places.map(place => ({
    url: place.websiteUri, 
    name: place.displayName.text
  })).filter(item => item.url)

  console.log(urls);

  db.query(`CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY,
    business_name VARCHAR(255) UNIQUE,
    business_website VARCHAR(255),
    email_address VARCHAR(255),
    email_sent INTEGER DEFAULT 0
  );`).run();

  const query = db.query("INSERT INTO emails (business_name, business_website, email_address) VALUES ($business_name, $business_website, $email_address)");
  
  urls.forEach(async item => {
    const emails = await extractEmails(item.url)
    emails.forEach(email => {
      try {
        query.run({ $business_name: item.name, $business_website: item.url, $email_address: email.toLowerCase()})
      } catch (e) {
        // console.log(e);
      }
    })

  })


}

main();

