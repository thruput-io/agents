package shop

func ShippingCost(weight int) int {
	return RateFor(weight) * 2
}
