import { PolymarketApiClient, PublicTraderService } from '@polytrader/polymarket-api';

const publicTraderService = new PublicTraderService(PolymarketApiClient.getInstance());

export { publicTraderService };
