interface Folding<Shape, Foreign> {
	readonly encode: (shape: Shape) => Foreign;
}

export type { Folding };
