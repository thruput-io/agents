package shop

import "testing"

func TestShippingCost(t *testing.T) {
	if ShippingCost(1) != 2 {
		t.Fail()
	}
}
