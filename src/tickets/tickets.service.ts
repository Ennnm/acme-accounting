import { User, UserRole } from '../../db/models/User';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { Op } from 'sequelize';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TicketService {
  async getRegistrationAssignee(companyId: number): Promise<User> {
    let assignees = await User.findAll({
      where: { companyId, role: UserRole.corporateSecretary },
    });

    if (!assignees.length) {
      assignees = await User.findAll({
        where: { companyId, role: UserRole.director },
      });
      if (!assignees.length) {
        throw new Error(
          'Cannot find user with role corporateSecretary or director to create a ticket',
        );
      } else if (assignees.length > 1) {
        throw new Error(
          `Can't find secretary, multiple users with role director. Cannot create a ticket`,
        );
      }
    } else if (assignees.length > 1) {
      throw new Error(
        `Multiple users with role corporateSecretary. Cannot create a ticket`,
      );
    }

    return assignees[0];
  }

  async handleRegistrationAddressChange(companyId: number): Promise<Ticket> {
    const regisTickets = await Ticket.findAll({
      where: {
        companyId,
        type: TicketType.registrationAddressChange,
      },
    });

    if (regisTickets.length > 0) {
      throw new Error(
        'Company already has a ticket of type registrationAddressChange',
      );
    }
    const assignee = await this.getRegistrationAssignee(companyId);
    return await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      type: TicketType.registrationAddressChange,
      category: TicketCategory.corporate,
      status: TicketStatus.open,
    });
  }

  async getManagementAssignee(companyId: number): Promise<User> {
    const assignees = await User.findAll({
      where: { companyId, role: UserRole.accountant },
      order: [['createdAt', 'DESC']],
    });

    if (!assignees.length)
      throw new Error(
        `Cannot find user with role ${UserRole.accountant} to create a ticket`,
      );
    return assignees[0];
  }

  async handleManagementReport(companyId: number): Promise<Ticket> {
    const assignee = await this.getManagementAssignee(companyId);
    return await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      type: TicketType.managementReport,
      category: TicketCategory.accounting,
      status: TicketStatus.open,
    });
  }

  async getStrikeOffAssignee(companyId: number): Promise<User> {
    const assignees = await User.findAll({
      where: { companyId, role: UserRole.director },
    });

    if (!assignees.length)
      throw new Error(
        `Cannot find user with role ${UserRole.director} to create a ticket`,
      );
    else if (assignees.length > 1)
      throw new Error(
        `Multiple users with role ${UserRole.director}. Cannot create a ticket`,
      );
    return assignees[0];
  }

  async handleStrikeOff(companyId: number): Promise<Ticket> {
    const assignee = await this.getStrikeOffAssignee(companyId);

    const activeTickets = await Ticket.findAll({
      where: {
        companyId,
        status: TicketStatus.open,
        type: {
          [Op.ne]: TicketType.strikeOff,
        },
      },
    });

    await Promise.all(
      activeTickets.map((ticket) =>
        ticket.update({ status: TicketStatus.resolved }),
      ),
    );
    return await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      type: TicketType.strikeOff,
      category: TicketCategory.management,
      status: TicketStatus.open,
    });
  }
}
