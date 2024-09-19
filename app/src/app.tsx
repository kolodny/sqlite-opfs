/* eslint-disable @typescript-eslint/no-explicit-any */
import { FunctionComponent, useState } from 'react';
import initWrapper, { type WrappedDatabase } from 'sqlite-opfs';

// import SqliteWorker from 'sqlite-opfs/worker?worker';
import SqliteWorker from './myworker?worker';

const sqlite = await initWrapper({
	getWorker: () => new SqliteWorker(),
});

const COMMANDS = [
	`CREATE TABLE IF NOT EXISTS myTable (id INTEGER PRIMARY KEY, name TEXT)`,
	`INSERT INTO myTable (name) VALUES ('Alice')`,
	`INSERT INTO myTable (name) VALUES ('Bob')`,
	`SELECT * FROM myTable`,
	`SELECT 1, 2, add_nums(10, 20, 30)`,
];

export const App: FunctionComponent = () => {
	const [dbName, setDbName] = useState('myDb');
	const [openedDbName, setOpenedDbName] = useState('');
	const [db, setDb] = useState<WrappedDatabase | null>(null);
	const [results, setResults] = useState<Record<string, string>[]>([]);

	const exec = async () => {
		try {
			const rows = await db!.unsafe((window as any).sql.value).all();
			console.log(rows);
			setResults(rows as any);
		} catch (error) {
			console.error(error);
		}
	};

	return (
		<>
			<div style={{ display: 'flex', flexDirection: 'column' }}>
				<div style={{ display: 'flex', gap: 8 }}>
					<input value={dbName} onChange={(e) => setDbName(e.target.value)} />
					<button
						onClick={async () => {
							const openedDb = await sqlite.open(dbName);
							setDb(() => openedDb);
							setOpenedDbName(dbName);
						}}
					>
						Open {dbName}
					</button>
					Status: {db ? `Opened ${openedDbName}` : 'Closed'}
				</div>

				<div style={{ paddingTop: 16, paddingBottom: 8 }}>
					<select
						disabled={!db}
						onChange={(e) => {
							(window as any).sql.value = e.target.value;
							exec();
						}}
					>
						<option>Select Query</option>
						{COMMANDS.map((command) => (
							<option key={command} value={command}>
								{command}
							</option>
						))}
					</select>
				</div>
				<textarea
					disabled={!db}
					name="sql"
					id="sql"
					rows={5}
					style={{ width: 800 }}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.metaKey && !e.shiftKey && !e.ctrlKey) {
							e.preventDefault();
							exec();
						}
					}}
				/>
			</div>
			<div>
				<table style={{ border: '1px solid', borderCollapse: 'collapse' }}>
					<tbody>
						{!!results.length && (
							<tr>
								{Object.keys(results[0]).map((key) => (
									<th style={{ border: '1px solid', padding: 4 }} key={key}>
										{key}
									</th>
								))}
							</tr>
						)}
						{results.map((result, i) => (
							<tr key={i}>
								{Object.entries(result).map(([key, value]) => (
									<td style={{ border: '1px solid', padding: 4 }} key={key}>
										{value}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
};

export default App;
