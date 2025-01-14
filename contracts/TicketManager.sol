// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract TicketManager {
    // Mapping of ticket number to participant address
    mapping(uint => address) private ticketToParticipant;

    // Mapping of participant address to their list of tickets
    mapping(address => uint[]) private participantToTickets;

    // Mapping to check if a ticket is already assigned
    mapping(uint => bool) private isAlreadySet;

    // Array to store all ticket numbers
    uint[] private tickets;

    // Custom error for duplicate tickets
    error TicketAlreadyExists(uint ticket);

    /**
     * @dev Adds a ticket for a participant. Reverts if the ticket is already assigned.
     * @param ticket The ticket number to assign.
     * @param participant The address of the participant to assign the ticket to.
     */
    function addTicket(uint ticket, address participant) external {
        if (isAlreadySet[ticket]) {
            revert TicketAlreadyExists(ticket);
        }

        isAlreadySet[ticket] = true;
        ticketToParticipant[ticket] = participant;
        participantToTickets[participant].push(ticket);
        tickets.push(ticket);
    }

    /**
     * @dev Retrieves all tickets for a specific participant.
     * @param participant The address of the participant.
     * @return An array of ticket numbers assigned to the participant.
     */
    function getTicketsForParticipant(address participant) external view returns (uint[] memory) {
        return participantToTickets[participant];
    }

    /**
     * @dev Retrieves the participant associated with a specific ticket.
     * @param ticket The ticket number to look up.
     * @return The address of the participant assigned to the ticket.
     */
    function getParticipantForTicket(uint ticket) external view returns (address) {
        return ticketToParticipant[ticket];
    }

    /**
     * @dev Checks if a ticket exists.
     * @param ticket The ticket number to check.
     * @return True if the ticket exists, otherwise false.
     */
    function ticketExists(uint ticket) external view returns (bool) {
        return isAlreadySet[ticket];
    }

    /**
     * @dev Retrieves all tickets that have been assigned.
     * @return An array of all ticket numbers.
     */
    function getAll() external view returns (uint[] memory) {
        return tickets;
    }
}
