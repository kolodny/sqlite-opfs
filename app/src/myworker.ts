import { addHook } from 'sqlite-opfs/worker';

addHook({
	open: async (db) => {
		db.createFunction(
			'add_nums',
			(_ctx, ...args) => {
				let sum = 0;

				for (const arg of args) {
					sum += Number(arg);
				}

				return sum;
			},
			{ arity: -1 },
		);
	},
});
