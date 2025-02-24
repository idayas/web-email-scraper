import { chromium, Browser, Page } from "playwright";
import { Database } from "bun:sqlite";
import parse from "csv-simple-parser";

interface PlaceResult {
  name: string;
  url: string;
}

interface GooglePlace {
  websiteUri?: string;
  displayName: {
    text: string;
  };
}

interface GooglePlaceResponse {
  places: GooglePlace[];
}

interface RequestOptions {
  method: string;
  headers: {
    "X-Goog-Api-Key": string;
    "X-Goog-FieldMask": string;
    "Content-Type": string;
  };
  body: string;
}

interface Rec {
  City: string;
  State: string;
}

async function extractEmails(url: string): Promise<string[]> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(5000);

    try {
      await page.goto(url);
    } catch (navigationError: any) {
      console.error(`Navigation error for ${url}:`, navigationError.message);
      return [];
    }
    // Get the entire page content
    const content: string = await page.content();

    console.log(content);

    // Updated regex to find all email addresses, including those with spaces
    const emailPattern: RegExp =
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}(?<!\.(png|jpg|jpeg|gif|bmp|webp))\b/g;
    const emails: string[] = content.match(emailPattern) || [];

    // Remove spaces from email addresses and ensure uniqueness
    const uniqueEmails = new Set(
      emails.map((email) => email.replace(/\s/g, "")),
    );

    return Array.from(uniqueEmails);
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError: any) {
        console.error("Error closing browser:", closeError.message);
      }
    }
  }
}

async function searchPlacesQuery(query: string): Promise<GooglePlaceResponse> {
  const options: RequestOptions = {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_API_KEY as string,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.websiteUri",
      "Content-Type": "application/json",
    },
    body: `{\n  "textQuery": "${query}",\n}`,
  };

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      options,
    );
    const json: GooglePlaceResponse = await response.json();
    return json;
  } catch (err: any) {
    console.error(`API error for "${query}":`, err.message);
    return { places: [] };
  }
}

async function runSearch(googleQuery: string) {
  let db: Database | null = null;
  try {
    db = new Database("mydb.sqlite", { create: true });

    console.log("Searching for:", googleQuery);
    const responses = await searchPlacesQuery(googleQuery);

    const urls: PlaceResult[] = responses.places
      .map((place: GooglePlace) => ({
        url: place.websiteUri || "",
        name: place.displayName.text,
      }))
      .filter((item) => item.url);

    console.log(`Found ${urls.length} URLs to process`);

    try {
      db.query(
        `CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY,
        business_name VARCHAR(255) UNIQUE,
        business_website VARCHAR(255),
        email_address VARCHAR(255),
        email_sent INTEGER DEFAULT 0
      );`,
      ).run();
    } catch (tableError: any) {
      console.error("Error creating table:", tableError.message)
    }

    const query = db.query(
      "INSERT OR IGNORE INTO emails (business_name, business_website, email_address) VALUES ($business_name, $business_website, $email_address)",
    );

    for (const item of urls) {
      console.log(`Processing website; ${item.url}`);

      try {
        const emails = await extractEmails(item.url);
        console.log(`Found ${emails.length} emails for ${item.name}`);

        for (const email of emails) {
          try {
            query.run({
              $business_name: item.name,
              $business_website: item.url,
              $email_address: email.toLowerCase(),
            });
          } catch (insertError: any) {
            console.error(`Error inserting email ${email}:`, insertError.message)
          }
        }
      } catch (processingError: any) {
        console.error(`Failed to process ${item.url}:`, processingError.message);
      }
    }
  } catch (error: any) {
    console.error(`Error in runSearch for "${googleQuery}":`, error.message)
  } finally {
    if (db) {
      try {
        db.close();
      } catch (closeError: any) {
        console.error("Error closing database:", closeError.message)
      }
    }
  }

}

async function main() {
  const file: string = process.argv.slice(2)[0] ?? null;

  const googleQuery = prompt("Businesses to search:");

  if (googleQuery === null) {
    console.log("Search cancelled");
    return;
  }

  if (file) {
    try {
      const csv = Bun.file(file);
      const csvText = await csv.text();
      const rawData = parse(csvText, { header: true });
      const data: Rec[] = rawData.map((row: any) => ({
        City: row.City,
        State: row.State,
      }));

      for (const row of data) {
        if (!row.City || !row.State) {
          continue;
        }
        await runSearch(`${googleQuery} in ${row.City}, ${row.State}`);
      }
    } catch (err) {
      console.error("File could not be found");
      process.exit(1);
    }
  }

  await runSearch(googleQuery);
}

main();
