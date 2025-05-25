import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  describe('accounts', () => {
    it('should change state from idle', () => {
      service.accounts();
      expect(service.state('accounts')).not.toBe('idle');
    });
  });
  describe('yearly', () => {
    it('should change state from idle', () => {
      service.yearly();
      expect(service.state('yearly')).not.toBe('idle');
    });
  });
  describe('fs', () => {
    it('should change state from idle', () => {
      service.fs();
      console.log(service.state('fs'));
      expect(service.state('fs')).not.toBe('idle');
    });
  });
  describe('asyncAccounts', () => {
    it('should change state from idle', async () => {
      await service.asyncAccounts();
      expect(service.state('accounts')).not.toBe('idle');
    });
  });
  describe('asyncYearly', () => {
    it('should change state from idle', async () => {
      await service.asyncYearly();
      expect(service.state('yearly')).not.toBe('idle');
    });
  });
  describe('asyncFs', () => {
    it('should change state from idle', async () => {
      await service.asyncFs();
      console.log(service.state('fs'));
      expect(service.state('fs')).not.toBe('idle');
    });
  });
});
