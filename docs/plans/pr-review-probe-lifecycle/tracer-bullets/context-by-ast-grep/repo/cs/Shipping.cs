public static class Shipping
{
    public static int ShippingCost(int weight) => Rates.RateFor(weight) * 2;
}
