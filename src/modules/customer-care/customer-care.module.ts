import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreTraceTracker } from '../../database/entities/core-trace-tracker.entity';
import { CoreCustomerCareError } from '../../database/entities/core-customer-care-error.entity';
import { CustomerCareController } from './customer-care.controller';
import { CustomerCareService } from './customer-care.service';
import { CustomerCareAirService } from './services/customer-care-air.service';
import { CustomerCareNetworkService } from './services/customer-care-network.service';
import { CustomerCareHistoryService } from './services/customer-care-history.service';
import { CustomerCareSdpTraceService } from './services/customer-care-sdp-trace.service';
import { CustomerCareAirTraceService } from './services/customer-care-air-trace.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoreTraceTracker, CoreCustomerCareError])],
  controllers: [CustomerCareController],
  providers: [
    CustomerCareService,
    CustomerCareAirService,
    CustomerCareNetworkService,
    CustomerCareHistoryService,
    CustomerCareSdpTraceService,
    CustomerCareAirTraceService,
  ],
  exports: [CustomerCareService],
})
export class CustomerCareModule {}
