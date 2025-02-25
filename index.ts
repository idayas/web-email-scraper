import { Database } from "bun:sqlite";
import parse from "csv-simple-parser";

interface PlaceResult {
  name: string;
  url: string;
  address: string;
}

interface GooglePlace {
  websiteUri?: string;
  displayName: {
    text: string;
  };
  formattedAddress: string;
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

// New function that uses fetch instead of Playwright
async function extractEmails(url: string): Promise<string[]> {
  try {
    // Use a timeout promise to limit fetch time
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Make sure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    // Fetch the webpage content
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
    }).catch((err) => {
      console.error(`Fetch error for ${url}:`, err.message || err);
      return null;
    });

    // Clear the timeout
    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      console.error(
        `Failed to fetch ${url}: ${response ? response.status : "No response"}`,
      );
      return [];
    }

    // Get the content as text
    const content = await response.text();

    // Extract emails using regex
    const emailPattern =
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}(?<!\.(png|jpg|jpeg|gif|bmp|webp))\b/g;
    const emails = content.match(emailPattern) || [];

    // Remove spaces and ensure uniqueness
    const uniqueEmails = new Set(
      emails.map((email) => email.replace(/\s/g, "")),
    );

    return Array.from(uniqueEmails);
  } catch (error) {
    console.error(`Error processing ${url}:`, error.message || error);
    return [];
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

    console.log("\n\nSearching for:", googleQuery);
    const responses = await searchPlacesQuery(googleQuery);

    const urls: PlaceResult[] = responses.places
      .map((place: GooglePlace) => ({
        url: place.websiteUri || "",
        name: place.displayName.text,
        address: place.formattedAddress
      }))
      .filter((item) => item.url);

    console.log(`Found ${urls.length} URLs to process`);

    try {
      db.query(
        `CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY,
        business_name VARCHAR(255) UNIQUE,
        business_address VARCHAR(255),
        business_website VARCHAR(255),
        email_address VARCHAR(255),
        email_sent INTEGER DEFAULT 0
      );`,
      ).run();
    } catch (tableError: any) {
      console.error("Error creating table:", tableError.message);
    }

    const query = db.query(
      "INSERT OR IGNORE INTO emails (business_name, business_address, business_website, email_address) VALUES ($business_name, $business_address, $business_website, $email_address)",
    );

    // Process URLs sequentially
    for (const item of urls) {
      console.log(`Processing website: ${item.url}`);

      // Extract emails with built-in error handling
      let emails: string[] = [];
      try {
        emails = await extractEmails(item.url);
        console.log(`    Found ${emails.length} emails for ${item.name}`);
      } catch (processingError: any) {
        console.error(
          `Failed to process ${item.url}:`,
          processingError.message || processingError,
        );
        // Continue to next item
        continue;
      }

      // Insert emails into database
      for (const email of emails) {
        try {
          query.run({
            $business_name: item.name,
            $business_address: item.address,
            $business_website: item.url,
            $email_address: email.toLowerCase(),
          });
        } catch (insertError: any) {
          console.error(
            `Error inserting email ${email}:`,
            insertError.message || insertError,
          );
        }
      }
    }
  } catch (error: any) {
    console.error(
      `Error in runSearch for "${googleQuery}":`,
      error.message || error,
    );
  } finally {
    // Close database
    if (db) {
      try {
        db.close();
      } catch (closeError: any) {
        console.error(
          "Error closing database:",
          closeError.message || closeError,
        );
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
  } else {
    // Only run the direct search if no file was provided
    await runSearch(googleQuery);
  }
}

main();
