interface Either<Failure, Success> {
	mapAsync: <Mapped>(
		onSuccess: (success: Success) => Promise<Mapped>,
	) => Promise<Either<Failure, Mapped>>;
	fold: <Folded>(
		onFailure: (failure: Failure) => Folded,
		onSuccess: (success: Success) => Folded,
	) => Folded;
}

export type { Either };
