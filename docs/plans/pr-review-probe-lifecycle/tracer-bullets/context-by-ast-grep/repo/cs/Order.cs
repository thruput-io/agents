public static class Order
{
    // Shipping.ShippingCost(2) is worked out below
    public const string Label = "Shipping.ShippingCost(1)";
    public static readonly int Total = Shipping.ShippingCost(3);
}
