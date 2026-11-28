from shipping import shipping_cost


def test_shipping_cost():
    assert shipping_cost(1) == 2
