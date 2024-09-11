/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable n/no-unsupported-features/node-builtins */
/* eslint-disable @typescript-eslint/no-dynamic-delete */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import type {
	InitOptions,
	OpfsDatabase,
	PreparedStatement,
	SqlValue,
	Sqlite3Static,
} from '@sqlite.org/sqlite-wasm';

import init from '@sqlite.org/sqlite-wasm';
import { ImportSource } from './types.js';

type Async<T = void> = T | Promise<T>;

interface Hook {
	beforeInit?: (options: InitOptions) => Async<InitOptions>;
	onInit?: (sqlite3: Sqlite3Static) => Async;
	onOpen?: (opened: OpfsDatabase, sqlite3: Sqlite3Static) => Async;
	onExec?: (
		sql: string,
		bind: unknown[] | undefined,
		stmt: PreparedStatement,
		execId: string,
	) => Async;
	onDispose?: (execId: string) => Async;
}

declare global {
	// eslint-disable-next-line no-var
	var openDbs: Record<string, OpfsDatabase>;
	// eslint-disable-next-line no-var
	var openExecs: Record<string, Generator<[SqlValue[], string[]], void, never>>;
	// eslint-disable-next-line no-var
	var addHook: (hook: Hook) => void;
}

self.openDbs = {};
self.openExecs = {};
const hooks: Hook[] = [];

export const addHook = (self.addHook = (hook) => hooks.push(hook));

// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
let message = (event: MessageEvent) => {};
const post = (item: unknown) => (self.postMessage(item), true);

self.addEventListener('message', (event) => {
	message(event);
});

interface Options {
	wasmBinary?: string | ArrayBuffer;
	/** Options to pass to the init method of `@sqlite.org/sqlite-wasm` */
	wasmOptions?: Record<string, unknown>;
}

const start = async (options: Options = {}) => {
	const initOptions: InitOptions = {};
	if (typeof options.wasmBinary === 'string') {
		initOptions.locateFile = () => options.wasmBinary as string;
	} else if (typeof options.wasmBinary === 'object') {
		(initOptions as Record<string, unknown>).wasmBinary = options.wasmBinary;
	}

	let hookedOptions = initOptions;
	for (const hook of hooks) {
		hookedOptions = (await hook.beforeInit?.(hookedOptions)) ?? hookedOptions;
	}
	const sqlite3: Sqlite3Static = await init(hookedOptions);

	const assert = <T>(obj: T | undefined) => {
		if (!obj) {
			throw new Error('Expect object to be defined');
		}
		return obj;
	};
	const affirm = (db: OpfsDatabase | undefined) => assert(db).affirmOpen();

	const api = {
		import: async (dbName: string, source: ImportSource, id: string) => {
			const wasOpen = !!openDbs[dbName];
			await api.close(dbName);
			const dir = await navigator.storage.getDirectory();
			const file = await dir.getFileHandle(dbName, { create: true });
			const writer = await file.createWritable();

			if (source instanceof Uint8Array) {
				await writer.write(source);
				await writer.close();

				if (wasOpen) {
					await api.open(dbName);
				}
				return;
			}

			if (typeof source === 'string') {
				const readerIter = async function* () {
					const response = await fetch(source);
					const reader = response.body?.getReader();
					let read = await reader?.read();
					while (!read?.done) {
						yield read?.value;
						read = await reader?.read();
					}
				};
				let processed = 0;
				for await (const chunk of readerIter()) {
					if (!chunk) {
						continue;
					}

					await writer.write(chunk);
					processed += chunk.length;
					self.postMessage({ type: 'importProgress', id, processed });
				}
				await writer.close();
				if (wasOpen) {
					await api.open(dbName);
				}
				return;
			}

			throw new Error('Unsupported source type');
		},
		open: async (dbName: string) => {
			if (!openDbs[dbName]) {
				type Oo1 = typeof sqlite3.oo1;
				let ctr: Oo1['OpfsDb'] | Oo1['DB'] = sqlite3.oo1.OpfsDb;
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (!ctr) {
					console.error(
						'sqlite3.oo1.DB is not defined, falling back to sqlite3.oo1.Db',
					);
					ctr = sqlite3.oo1.DB;
				}
				const opened = new ctr(dbName);
				openDbs[dbName] = opened;
			}
			for (const hook of hooks) {
				await hook.onOpen?.(openDbs[dbName], sqlite3);
			}

			return dbName;
		},
		close: async (dbName: string) => {
			for (const exec of Object.keys(openExecs)) {
				if (exec.startsWith(`${dbName}:`)) {
					await api.dispose(exec);
				}
			}
			openDbs[dbName]?.close();
			delete openDbs[dbName];
		},
		exec: async (dbName: string, sql: string, bind?: unknown[]) => {
			const db = affirm(openDbs[dbName]);

			const execId = `${dbName}:${Math.random().toString(36).slice(2)}`;
			const stmt = db.prepare(sql);

			if (bind) {
				stmt.bind(bind as never[]);
			}
			openExecs[execId] = (function* () {
				try {
					while (stmt.step()) {
						const names = stmt.getColumnNames();
						yield [stmt.get([]), names];
					}
					stmt.reset();
				} finally {
					stmt.finalize();
				}
			})();

			for (const hook of hooks) {
				await hook.onExec?.(sql, bind, stmt, execId);
			}

			return execId;
		},

		next: (execId: string) => {
			const exec = assert(openExecs[execId]);
			const { done, value } = exec.next();
			if (done) {
				delete openExecs[execId];
			}
			return { done, value };
		},
		changes: (dbName: string) => {
			const db = affirm(openDbs[dbName]);
			return db.changes();
		},
		dispose: async (execId: string) => {
			for (const hook of hooks) {
				await hook.onDispose?.(execId);
			}
			openExecs[execId]?.return();
			delete openExecs[execId];
		},
	};

	for (const hook of hooks) {
		await hook.onInit?.(sqlite3);
	}

	message = ({ data: event }) => {
		const { type, id, key, args } = event;
		if (type !== 'apiCall') {
			return;
		}
		const ok = (result: unknown) => post({ type: 'apiResponse', id, result });
		const error = (error: unknown) => post({ type: 'apiResponse', id, error });

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		Promise.resolve((api as any)[`${key}`](...args)).then(ok, error);
	};
};

message = (event) => {
	start(event.data as never).then(
		() => {
			postMessage(null);
		},
		(error: unknown) => {
			postMessage(error);
		},
	);
};

postMessage(null);
