# Business Email Scraper
A CLI tool that uses Google Maps API to find businesses matching your search query and then scrapes those websites for contact information. Useful for generating leads.

## Installation
Requires [Bun](https://bun.sh/) to run.

To install dependencies:

```bash
bun install
```

Copy .env.example to .env and add your [Google Places API](https://developers.google.com/maps/documentation/places/web-service/overview) Key
```bash
cp .env.example .env
```

To run:
```bash
bun run index.ts

>> Businesses to search: Restaurants near New York, NY
>> Searching for: Restaurants near New York, NY

# With CSV
bun run list_emails.ts list.csv

>> Businesses to search: Restaurants
>> Searching for: Restaurants in Anchorage, Alaska
```

Run the list_emails.ts to preview the results:
```bash
bun run list_emails.ts
```

OR open the mydb.sqlite file in your preferred SQLite database viewer, such as [SQLiteViewer](https://sqliteviewer.app/).
