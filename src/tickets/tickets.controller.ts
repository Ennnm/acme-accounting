import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Company } from '../../db/models/Company';
import { Ticket, TicketType } from '../../db/models/Ticket';
import { User } from '../../db/models/User';
import { newTicketDto, TicketDto } from './tickets.interface';
import { TicketService } from './tickets.service';

@Controller('api/v1/tickets')
export class TicketsController {
  constructor(private ticketService: TicketService) {}

  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;
    let ticket: Ticket;
    try {
      switch (type) {
        case TicketType.registrationAddressChange:
          ticket =
            await this.ticketService.handleRegistrationAddressChange(companyId);
          break;
        case TicketType.managementReport:
          ticket = await this.ticketService.handleManagementReport(companyId);
          break;
        default:
          ticket = await this.ticketService.handleStrikeOff(companyId);
          break;
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : 'An unknown error occurred';
      throw new ConflictException(errorMessage);
    }

    const ticketDto: TicketDto = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }
}
