/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable @typescript-eslint/ban-ts-comment */
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

type Async<T = void> = T | Promise<T>;

interface Hook {
	init?: (sqlite3: Sqlite3Static) => Async;
	open?: (opened: OpfsDatabase) => Async;
	exec?: (
		sql: string,
		bind: unknown[] | undefined,
		stmt: PreparedStatement,
		execId: string,
	) => Async;
	dispose?: (execId: string) => Async;
	print?: (msg: string) => void;
	printErr?: (msg: string) => void;
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
let print: ((msg: string) => void) | undefined;
let printErr: ((msg: string) => void) | undefined;
const hooks: Hook[] = [];
const addHook = (self.addHook = (hook) => {
	hooks.push(hook);

	if (hook.print) {
		print = hook.print;
	}
	if (hook.printErr) {
		printErr = hook.printErr;
	}
});

export { addHook };

// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
let message = (event: MessageEvent) => {};

self.addEventListener('message', (event) => {
	message(event);
});

interface Options {
	wasmBinary?: string | ArrayBuffer;
	/** Options to pass to the init method of `@sqlite.org/sqlite-wasm` */
	wasmOptions?: Record<string, unknown>;
}

const start = async (options: Options = {}) => {
	const initOptions: InitOptions = { print, printErr };
	if (typeof options.wasmBinary === 'string') {
		initOptions.locateFile = () => options.wasmBinary as string;
	} else if (typeof options.wasmBinary === 'object') {
		(initOptions as Record<string, unknown>).wasmBinary = options.wasmBinary;
	}

	const sqlite3: Sqlite3Static = await init(initOptions);

	const assert = <T>(obj: T | undefined) => {
		if (!obj) {
			throw new Error('Expect object to be defined');
		}
		return obj;
	};
	const affirm = (db: OpfsDatabase | undefined) => assert(db).affirmOpen();

	const api = {
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
				await hook.open?.(openDbs[dbName]);
			}

			return dbName;
		},
		exec: async (dbName: string, sql: string, bind?: unknown[]) => {
			const db = affirm(openDbs[dbName]);

			const execId = Math.random().toString(36).slice(2);
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
				await hook.exec?.(sql, bind, stmt, execId);
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
				await hook.dispose?.(execId);
			}
			openExecs[execId]?.return();
			delete openExecs[execId];
		},
	};

	for (const hook of hooks) {
		await hook.init?.(sqlite3);
	}

	message = ({ data: event }) => {
		const { id, key, args } = event;
		void (async () => {
			try {
				// @ts-ignore
				const result = await api[`${key}`](...args);
				self.postMessage({ id, result });
			} catch (error) {
				self.postMessage({ id, error });
			}
		})();
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
