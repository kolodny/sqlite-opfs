<h1 align="center">Sqlite Opfs</h1>

<p align="center">Sqlite wasm build using the origin private file system</p>

<p align="center">
	<a href="https://github.com/kolodny/sqlite-opfs/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg"></a>
	<a href="http://npmjs.com/package/sqlite-opfs"><img alt="📦 npm version" src="https://img.shields.io/npm/v/sqlite-opfs?color=21bb42&label=%F0%9F%93%A6%20npm" /></a>
	<img alt="💪 TypeScript: Strict" src="https://img.shields.io/badge/%F0%9F%92%AA_typescript-strict-21bb42.svg" />
</p>

This is a wrapper around [`@sqlite.org/sqlite-wasm`](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm) that uses the [origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system). It also handles running the sqlite code in a web worker while providing a nice API to query on.

There are two requirements for this library to work:

- You'll need to provide a web worker factory for the sqlite wrapper to use. The library can't handle this since it's bundler specific and node_modules imports are not able to create web workers with relative imports without some configuration on the bundler side.
- You need to ensure that your server includes specific headers for Atomics and SharedArrayBuffer to work properly. See https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep for more information.

You may need to use something like https://github.com/gzuidhof/coi-serviceworker if you can't control the headers on the server.

## Installation

```shell
npm i sqlite-opfs @sqlite.org/sqlite-wasm
```

Note that `@sqlite.org/sqlite-wasm` is a peer dependency which is why it's not included in the installation command.

Vite users will also have to add `optimizeDeps` this to their vite config:

```ts
export default defineConfig({
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
	// ...
});
```

## Usage

```ts
import init from 'sqlite-opfs';

// For vite usage
import SqliteWorker from 'sqlite-opfs/worker?worker';

const sqlite = await init({
	getWorker: () => new SqliteWorker(),
});
const db = await sqlite.open('myDb');
// await db`DROP TABLE IF EXISTS myTable`.run();
await db`CREATE TABLE IF NOT EXISTS myTable (id INTEGER PRIMARY KEY, name TEXT)`.run();
await db`INSERT INTO myTable (name) VALUES ('Alice')`.run();
await db`INSERT INTO myTable (name) VALUES ('Alan')`.run();
await db`INSERT INTO myTable (name) VALUES ('Billy')`.run();
await db`INSERT INTO myTable (name) VALUES ('Bob')`.run();
await db`INSERT INTO myTable (name) VALUES ('Brian')`.run();

console.log(
	'changes',
	await db`UPDATE myTable SET name = name || '!' WHERE name LIKE 'B%'`.run(),
);

console.log('all', await db`SELECT * FROM myTable`.all());
console.log('just name', await db`SELECT * FROM myTable`.all('name'));
console.log('one', await db`SELECT * FROM myTable`.one());

const like = 'B%';
console.log(
	'escape',
	await db`SELECT * FROM myTable WHERE name LIKE ${like}`.all(),
);

for await (const row of db`SELECT * FROM myTable`) {
	console.log('row', row);
}

// Can even run parallel queries
await Promise.all([
	(async () => {
		for await (const row of db`SELECT * FROM myTable`) {
			console.log('q1', row);
			await new Promise((r) => setTimeout(r, Math.random() * 100));
		}
	})(),
	(async () => {
		for await (const row of db`SELECT * FROM myTable`) {
			console.log('q2', row);
			await new Promise((r) => setTimeout(r, Math.random() * 100));
		}
	})(),
]);
```

Note the `one()` and `all()` methods also take a selector for the format of the result.

```ts
console.log('one', await db`SELECT * FROM myTable`.one('id', 'name')); // logs { id: SqlValue, name: SqlValue }
console.log('one', await db`SELECT * FROM myTable`.one(['id', 'name'])); // logs SqlValue[]
console.log('one', await db`SELECT * FROM myTable`.one([])); // logs all as SqlValue[]
console.log('one', await db`SELECT * FROM myTable`.one()); // logs all as Record<string, SqlValue>
console.log('one', await db`SELECT * FROM myTable`.one({})); // logs all as Record<string, SqlValue>
```

You can also wrap the worker in a worker of your own to have code that lives within the same context of the worker. For example:

```ts
// my-worker.ts
import { addHook } from 'sqlite-opfs/worker';

addHook({
	open: async (db) => {
		db.createFunction(
			'add_numbers',
			(_ctx, ...args) => {
				let sum = 0;

				for (const arg of args) {
					sum += Number(arg);
				}

				return sum;
			},
			// Needed for variadic functions, otherwise use the `callback.length` value.
			{ arity: -1 },
		);
	},
});
```

```ts
import SqliteWorker from './my-worker?worker';

const sqlite = await loadSqliteWrapper({
	getWorker: () => new SqliteWorker(),
});
const db = await sqlite.open('myDb');
console.log(await db`SELECT 1, 2, add_nums(10, 20, 30)`.one([])); // logs [1, 2, 60]
```
