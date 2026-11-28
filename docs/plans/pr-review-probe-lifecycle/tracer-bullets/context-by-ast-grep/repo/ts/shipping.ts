import { rateFor } from "./rates";

export function shippingCost(weight: number): number {
	return rateFor(weight) * 2;
}
