import parse from "csv-simple-parser"

const file: string = process.argv.slice(2)[0] ?? "list.csv"
const csv = Bun.file(file)

type Rec = {
  City: string;
  State: string;
}

const records: Rec[] = []

const data = parse (await csv.text(), {header: true}) as Rec[]

for (const row of data) {
  if (!row.City || !row.State) {
    continue;
  }
  records.push({City: row.City, State: row.State})
}

console.log(records)
