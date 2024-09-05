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
import type { BaseSelect, RowType } from './types.js';

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
	const okOptions = Object.fromEntries(
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		Object.entries(options).filter((o) => JSON.stringify(o[1]) !== undefined),
	);
	worker.postMessage(okOptions);
	await promise;
	worker.addEventListener('message', ({ data }) => {
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

	for (const key of ['open', 'exec', 'next', 'changes', 'dispose']) {
		wrappedApi[key] = (...args: never[]) => {
			const thisId = id++;
			const promise = new Promise((r, j) => {
				defers[thisId] = { resolve: r, reject: j };
			});
			worker.postMessage({ id: thisId, key, args });
			return promise as Promise<never>;
		};
	}

	const api = wrappedApi;

	return {
		open: async (dbName: string) => {
			const db = await api.open(dbName);

			type Bind = string | number | undefined | null | boolean;
			return (
				tmpl: TemplateStringsArray | string,
				...values: Bind[] | [Bind[]]
			) => {
				let used = false;
				async function* iter() {
					if (used) {
						throw new Error('Already used');
					}
					const sql = typeof tmpl === 'object' ? tmpl.join('?') : tmpl;
					const bind = values.length ? values : undefined;
					const id = await api.exec(db, sql, bind);
					used = true;
					try {
						let next = await api.next(id);
						while (!next.done) {
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
					for await (const data of iter()) {
						if (data) {
							const [row, columns] = data;
							yield rowType(row, columns, [{}]);
						}
					}
				};

				return {
					[Symbol.asyncIterator]: rowIter as () => AsyncGenerator<
						Record<string, SqlValue>,
						void
					>,
					/** Runs the sql and returns the first row */
					one: async (...select: BaseSelect) => {
						for await (const data of iter()) {
							if (data) {
								const [row, columns] = data;
								return rowType(row, columns, select);
							}
						}
					},
					/** Runs the sql and returns all rows */
					all: async <Select extends BaseSelect>(...select: Select) => {
						const rows: RowType<Select>[] = [];
						for await (const data of iter()) {
							if (data) {
								const [row, columns] = data;
								rows.push(rowType(row, columns, select) as RowType<Select>);
							}
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
			};
		},
	};
}
