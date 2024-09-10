import type { SqlValue } from '@sqlite.org/sqlite-wasm';

export type ImportSource = Uint8Array | string | URL;

export type Cloneable =
	| { [key: string]: Cloneable }
	| Cloneable[]
	| Map<unknown, Cloneable>
	| Set<Cloneable>
	| Promise<Cloneable>
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	| void
	| ArrayBuffer
	| boolean
	| DataView
	| Date
	| Error
	| string
	| number
	| null
	| undefined
	| bigint
	// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
	| BigInt
	| RegExp
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array;

export type BaseSelect =
	| []
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	| [{}]
	| string[]
	| [string[]]
	| number[]
	| [number[]];

export type RowType<Select extends BaseSelect> = Select extends [number[]]
	? SqlValue[]
	: Select extends [string[]]
		? SqlValue[]
		: Select extends []
			? Record<string, SqlValue>
			: Select extends string[]
				? Record<Select[number], SqlValue>
				: Select extends []
					? Record<string, SqlValue>
					: Select extends [[]]
						? SqlValue[]
						: // eslint-disable-next-line @typescript-eslint/no-empty-object-type
							Select extends [{}]
							? Record<string, SqlValue>
							: Select extends string[]
								? Record<Select[number], SqlValue>
								: Select extends [string[]]
									? SqlValue[]
									: Select extends number[]
										? SqlValue[]
										: Select extends [number[]]
											? SqlValue[]
											: SqlValue[];

// type Test1 = RowType<[]>; // Record<string, SqlValue>
// type Test2 = RowType<[{}]>; // Record<string, SqlValue>
// type Test3 = RowType<string[]>; // Record<string, SqlValue>
// type Test4 = RowType<[string[]]>; // SqlValue[]
// type Test5 = RowType<number[]>; // SqlValue[]
// type Test6 = RowType<[number[]]>; // SqlValue[]
// type Test7 = RowType<[[]]>; // SqlValue[]
// type Test8 = RowType<['a', 'b']> // Record<'a' | 'b', SqlValue>

export type Bind = string | number | undefined | null | boolean;
type BaseTag = (
	sql: TemplateStringsArray | string,
	...values: Bind[]
) => {
	[Symbol.asyncIterator]: () => AsyncGenerator<Record<string, SqlValue>, void>;
	value: () => Promise<SqlValue>;
	one: <Select extends BaseSelect>(
		...select: Select
	) => Promise<undefined | RowType<Select>>;
	all: <Select extends BaseSelect>(
		...select: Select
	) => Promise<RowType<Select>[]>;
	run: () => Promise<number>;
};

export type Tag = BaseTag & {
	unsafe: (sql: string, values?: Bind[]) => ReturnType<BaseTag>;
};
