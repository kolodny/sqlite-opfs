import { addHook } from 'sqlite-opfs/worker';

addHook({
	onOpen: (db) => {
		db.createFunction(
			'add_nums',
			(_ctx, ...args) => {
				let sum = 0;

				for (const arg of args) {
					sum += Number(arg) || 0;
				}

				return sum;
			},
			{ arity: -1 },
		);
	},
});
