# /add-airline

Scaffold a new airline adapter for AirlineOS.

## Usage
```
/add-airline
```

## What this does
1. Asks for: airline name, IATA code, primary color, secondary color, logo (URL or emoji)
2. Creates `core/adapters/{code}/index.ts` implementing `AirlineAdapter`
3. Registers the adapter in `core/adapters/registry.ts`
4. Adds branding to the adapter's `BrandConfig`

## Template

Create a new file at `core/adapters/$IATA_CODE/index.ts`:

```typescript
import { AirlineAdapter, BrandConfig } from '../types';
import { generateMockFlights, generateSeatMap } from '@/utils/mockData';
import type { SearchParams, Flight, Seat, BookingRequest, BookingConfirmation, BookingDetails } from '@/types';

export class $NAME_Adapter implements AirlineAdapter {
  id = '$IATA_CODE';

  brand: BrandConfig = {
    name: '$FULL_NAME',
    logo: '$LOGO',
    primaryColor: '$PRIMARY_COLOR',
    secondaryColor: '$SECONDARY_COLOR',
  };

  async searchFlights(params: SearchParams): Promise<Flight[]> {
    // Replace with real API call
    return generateMockFlights(params.origin, params.destination, params.departureDate);
  }

  async getSeatMap(flightId: string, cabinClass: 'economy' | 'business' | 'first'): Promise<Seat[][]> {
    return generateSeatMap(cabinClass);
  }

  async createBooking(details: BookingRequest): Promise<BookingConfirmation> {
    return {
      bookingId: `${this.id}-${Date.now()}`,
      status: 'confirmed',
      pnr: Math.random().toString(36).substring(2, 8).toUpperCase(),
    };
  }

  async getBooking(bookingId: string): Promise<BookingDetails> {
    throw new Error('Not implemented');
  }

  async cancelBooking(bookingId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}
```

Then register in `core/adapters/registry.ts`:
```typescript
import { $NAME_Adapter } from './$IATA_CODE';
AdapterRegistry.register(new $NAME_Adapter());
```
