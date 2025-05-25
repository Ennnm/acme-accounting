"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var reports_service_1 = require("./src/reports/reports.service");
var ReportServiceLogPerformance = /** @class */ (function () {
    function ReportServiceLogPerformance() {
        this.svc = new reports_service_1.ReportsService();
        this.metricsFolder = 'metrics/reports';
    }
    ReportServiceLogPerformance.prototype.extractTime = function (state) {
        var match = state.match(/finished in (\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
    };
    ReportServiceLogPerformance.prototype.runMultipleTimes = function (times) {
        var _a, _b, _c;
        var totals = { accounts: 0, yearly: 0, fs: 0 };
        for (var i = 0; i < times; i++) {
            this.run();
            var states = {
                accounts: String((_a = this.svc.state('accounts')) !== null && _a !== void 0 ? _a : ''),
                yearly: String((_b = this.svc.state('yearly')) !== null && _b !== void 0 ? _b : ''),
                fs: String((_c = this.svc.state('fs')) !== null && _c !== void 0 ? _c : ''),
            };
            totals.accounts += this.extractTime(states.accounts);
            totals.yearly += this.extractTime(states.yearly);
            totals.fs += this.extractTime(states.fs);
        }
        var metrics = {
            avg_accounts: totals.accounts / times,
            avg_yearly: totals.yearly / times,
            avg_fs: totals.fs / times,
            times: times,
        };
        var metricsFile = "".concat(this.metricsFolder, "/metrics_").concat(Date.now(), ".json");
        fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
        return metrics;
    };
    ReportServiceLogPerformance.prototype.run = function () {
        this.svc.accounts();
        this.svc.yearly();
        this.svc.fs();
    };
    return ReportServiceLogPerformance;
}());
var reportPerformance = new ReportServiceLogPerformance();
reportPerformance.runMultipleTimes(10);
