import { Database } from "bun:sqlite"

const db = new Database("mydb.sqlite", {create: true});


 console.log(db.query('SELECT * FROM emails').all());
