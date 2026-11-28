from rates import rate_for


def shipping_cost(weight):
    return rate_for(weight) * 2
