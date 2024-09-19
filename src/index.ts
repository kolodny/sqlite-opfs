/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { SqlValue } from '@sqlite.org/sqlite-wasm';
import type { BaseSelect, Bind, ImportSource, RowType, Tag } from './types.js';

export type SqliteWrapper = Awaited<ReturnType<typeof initWrapper>>;
export type WrappedDatabase = Awaited<ReturnType<SqliteWrapper['open']>>;

interface Options {
	/**
	 * Factory to create a Web Worker that will communicate directly to sqlite
	 * See the README for more information.
	 */
	getWorker: () => Worker;
	/**
	 * If you want to use a specific wasm binary or if the default one isn't
	 * loading you can specify either a URL or ArrayBuffer
	 */
	wasmBinary?: string | ArrayBuffer;
}

export default async function initWrapper(options: Options) {
	const defers: Record<
		number,
		{ resolve: (t: never) => void; reject: (e: never) => void }
	> = {};
	const worker = options.getWorker();
	await new Promise((resolve) => {
		worker.addEventListener('message', resolve, { once: true });
	});

	const promise = new Promise((resolve, reject) => {
		worker.addEventListener(
			'message',
			(event) => {
				if (event.data) {
					// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
					reject(event.data);
				} else {
					resolve(null);
				}
			},
			{ once: true },
		);
	});
	const pass = (v: unknown) => typeof v !== 'function';
	const passedEntries = Object.entries(options).filter(([, v]) => pass(v));
	const passedOptions = Object.fromEntries(passedEntries);
	worker.postMessage(passedOptions);
	await promise;
	worker.addEventListener('message', ({ data }) => {
		if (data?.type !== 'apiResponse') {
			return;
		}
		const { id, result, error } = data;

		if (error) {
			defers[+id]?.reject(error as never);
		} else {
			defers[+id]?.resolve(result as never);
		}

		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete defers[+id];
	});

	const wrappedApi = {} as Record<string, any>;
	let id = 0;

	for (const key of [
		'import',
		'open',
		'close',
		'exec',
		'next',
		'changes',
		'dispose',
	]) {
		wrappedApi[key] = (...args: never[]) => {
			const thisId = id++;
			const promise = new Promise((r, j) => {
				defers[thisId] = { resolve: r, reject: j };
			});
			worker.postMessage({ type: 'apiCall', id: thisId, key, args });
			return promise as Promise<never>;
		};
	}

	const api = wrappedApi;

	return {
		import: async (
			dbName: string,
			source: ImportSource,
			progress?: (read: number) => void,
		) => {
			const id = Math.random();
			const onProgress = (event: MessageEvent) => {
				if (event.data?.type === 'importProgress' && event.data.id === id) {
					progress?.(event.data.processed);
				}
			};

			if (progress) {
				worker.addEventListener('message', onProgress);
			}
			await api.import(dbName, source, id);
			worker.removeEventListener('message', onProgress);
		},
		open: async (dbName: string) => {
			const db = await api.open(dbName);

			const tag = ((sql: TemplateStringsArray | string, ...values: Bind[]) => {
				let used = false;
				async function* iter() {
					if (used) {
						throw new Error('Already used');
					}
					const sqlString = typeof sql === 'object' ? sql.join('?') : sql;
					const bind = values.length ? values : undefined;
					const id = await api.exec(db, sqlString, bind);
					used = true;
					try {
						let next = await api.next(id);
						if (next?.error) {
							throw new Error(`${next?.error}`);
						}
						while (!next.done) {
							if (next?.error) {
								throw new Error(`${next?.error}`);
							}
							yield next.value;
							next = await api.next(id);
						}
					} finally {
						await api.dispose(id);
					}
				}

				const rowType = (
					row: SqlValue[],
					columns: string[],
					select: BaseSelect,
				) => {
					if (
						select.length === 0 ||
						(select.length === 1 &&
							typeof select[0] === 'object' &&
							!Array.isArray(select[0]))
					) {
						const returns: Record<string, SqlValue> = {};
						for (const name of columns) {
							returns[name] = row[columns.indexOf(name)]!;
						}
						return returns;
					}
					const debug = () =>
						`count: ${columns.length}, columns: ${JSON.stringify(columns)}`;
					if (select.length === 1 && Array.isArray(select[0])) {
						if (select[0].length === 0) {
							return row;
						}
						const returns: SqlValue[] = [];
						if (typeof select[0][0] === 'number') {
							for (const index of select[0]) {
								if (index >= columns.length) {
									throw new Error(`Column index ${index} out of range`);
								}
								returns.push(row[+index]!);
							}
							return returns;
						}
						if (typeof select[0][0] === 'string') {
							for (const name of select[0]) {
								const index = columns.indexOf(`${name}`);
								if (index === -1) {
									throw new Error(`Column ${name} not found (${debug()})`);
								}
								returns.push(row[index]!);
							}
							return returns;
						}
						throw new Error(`Invalid select: ${JSON.stringify(select)}`);
					}
					if (typeof select[0] === 'string') {
						const returns: Record<string, SqlValue> = {};
						for (const name of select) {
							const index = columns.indexOf(`${name}`);
							if (index === -1) {
								throw new Error(`Column ${name} not found (${debug()})`);
							}
							returns[`${name}`] = row[index]!;
						}
						return returns;
					}
					if (typeof select[0] === 'number') {
						const returns: SqlValue[] = [];
						for (const index of select) {
							if (+index >= columns.length) {
								throw new Error(
									`Column index ${index} out of range (${debug()})`,
								);
							}
							returns.push(row[+index]!);
						}
						return returns;
					}
					throw new Error('Invalid select');
				};

				const rowIter = async function* () {
					for await (const [row, columns] of iter()) {
						yield rowType(row, columns, [{}]);
					}
				};

				return {
					[Symbol.asyncIterator]: rowIter as () => AsyncGenerator<
						Record<string, SqlValue>,
						void
					>,
					/**
					 * Runs the sql and returns the only column of the only row. Throws
					 * if more than one row or column is returned.
					 * This is meant for queries like `SELECT COUNT(*) FROM table`
					 */
					value: async () => {
						const none = {};
						let returns: SqlValue | object = none;
						let index = 0;
						for await (const [row] of iter()) {
							if (index++) {
								throw new Error('Expected exactly 1 row, got more');
							}

							if (row.length !== 1) {
								throw new Error(`Expected exactly 1 column, got ${row.length}`);
							}
							returns = row[0] as SqlValue;
						}
						if (returns === none) {
							throw new Error('Expected exactly 1 row, got none');
						}
						return returns as SqlValue;
					},
					/** Runs the sql and returns the first row */
					one: async <Select extends BaseSelect>(...select: Select) => {
						for await (const [row, columns] of iter()) {
							return rowType(row, columns, select) as RowType<Select>;
						}
					},
					/** Runs the sql and returns all rows */
					all: async <Select extends BaseSelect>(...select: Select) => {
						const rows: RowType<Select>[] = [];
						for await (const [row, columns] of iter()) {
							rows.push(rowType(row, columns, select) as RowType<Select>);
						}
						return rows;
					},
					/** Runs the sql and returns the number of rows affected */
					run: async () => {
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						for await (const _row of iter());
						return api.changes(db);
					},
				};
			}) as Tag;

			tag.unsafe = (sql: string, values: Bind[] = []) => tag(sql, ...values);
			tag.close = () => api.close(dbName);

			return tag;
		},
	};
}
