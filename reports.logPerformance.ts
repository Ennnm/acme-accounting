import * as fs from 'fs';
import { ReportsService } from './src/reports/reports.service';

class ReportServiceLogPerformance {
  svc = new ReportsService();
  metricsFolder: string = 'metrics/reports/initial';

  private extractTime(state: string): number {
    const match = state.match(/finished in (\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  runMultipleTimes(times: number): Record<string, number> {
    const totals = { accounts: 0, yearly: 0, fs: 0 };

    for (let i = 0; i < times; i++) {
      this.run();
      const states = {
        accounts: String(this.svc.state('accounts') ?? ''),
        yearly: String(this.svc.state('yearly') ?? ''),
        fs: String(this.svc.state('fs') ?? ''),
      };

      totals.accounts += this.extractTime(states.accounts);
      totals.yearly += this.extractTime(states.yearly);
      totals.fs += this.extractTime(states.fs);
    }
    const metrics = {
      avg_accounts: totals.accounts / times,
      avg_yearly: totals.yearly / times,
      avg_fs: totals.fs / times,
      times,
    };
    const metricsFile = `${this.metricsFolder}/metrics_${Date.now()}.json`;
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
    return metrics;
  }

  run() {
    this.svc.accounts();
    this.svc.yearly();
    this.svc.fs();
  }
}

const reportPerformance = new ReportServiceLogPerformance();
reportPerformance.runMultipleTimes(1);
