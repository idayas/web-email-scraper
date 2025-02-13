# Business Email Scraper
A CLI tool that uses Google Maps API to find businesses matching your search query and then scrapes those websites for contact information. Great tool for generating leads.

## Installation
Requires [Bun](https://bun.sh/) to run.

To install dependencies:

```bash
bun install
```

Put google maps API key in .env.example, rename to .env.
```bash
cp .env.example .env
```

To run:
```bash
bun run index.ts
```

To then preview the results, run:
```bash
bun run list_emails.ts
```

OR open the mydb.sqlite file in your preferred SQLite database viewer, such as [SQLiteViewer](https://sqliteviewer.app/).
