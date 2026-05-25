# Skill: prediction-markets

Domain knowledge for prediction market arbitrage.

## How Prediction Markets Work

Prediction markets are binary outcome markets where prices represent implied probabilities.
A YES price of 0.73 means the market assigns 73% probability to the event occurring.

## Market Types on Polymarket

- **Binary**: YES/NO outcomes (most NBA markets)
- **Categorical**: Multiple team outcomes (rare for NBA)
- **CLOB**: Central Limit Order Book — prices are best bids/asks
- **AMM**: Automated Market Maker — prices derived from liquidity pool

For NBA, Polymarket uses CLOB. The `yesPrice` from the Gamma API is the current mid price.

## Mispricing Detection

Compare sportsbook-implied probability (after vig removal) to Polymarket price:

```
delta = sportsbookFairProb - polymarketPrice
relativeEdge = delta / polymarketPrice
```

Relative edge corrects for scale: 5pp gap on a 10% longshot is much larger than
5pp gap on a 50/50 coin flip.

## Vig Removal

Sportsbooks embed margin ("vig" or "juice") so implied probs sum to > 1.0:

```
vigFactor = 1 / sum(1/price for each outcome)
fairProb = (1/price) * vigFactor
```

After vig removal, fair probs for all outcomes sum to 1.0.

## Liquidity Considerations

- NBA playoff games: $1M–$4M volume per game on Polymarket
- Championship futures: $500K–$2M total pool
- Low liquidity (<$100K) = wide spread = less reliable price signal
