import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Resident Weekend Scheduler UI", () => {
  it("links to the GitHub README from the top bar", () => {
    render(<App />);

    const readmeLink = screen.getByRole("link", { name: "README" });
    expect(readmeLink).toHaveAttribute(
      "href",
      "https://github.com/that-engineer/Resident-Weekend-Scheduler/blob/main/README.md",
    );
  });

  it("adds a resident from the Pool Set header control", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ada");
    await user.type(screen.getByLabelText("Note"), "PGY-2");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("columnheader", { name: "Dr. Ada PGY-2" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches to the schedule view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Weekend Schedule" }));

    expect(screen.getByRole("heading", { name: "Warnings" })).toBeInTheDocument();
  });

  it("shows an erase mode for clearing painted pool cells", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Erase Clear painted cells" })).toBeInTheDocument();
  });

  it("keeps a manual first-resident assignment in the first resident column", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ada");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Weekend Schedule" }));

    const firstResidentCells = screen.getAllByTitle("Assign Dr. Ada");
    await user.click(firstResidentCells[0]);

    expect(firstResidentCells[0]).toHaveClass("assigned");
    expect(screen.getAllByRole("rowheader")[0]).not.toHaveClass("assigned");
    expect(screen.getByDisplayValue(/Assigned hours: 24/)).toBeInTheDocument();

    await user.click(firstResidentCells[0]);

    expect(firstResidentCells[0]).not.toHaveClass("assigned");
    expect(screen.getByDisplayValue(/Assigned hours: 0/)).toBeInTheDocument();
  });

  it("opens resident metrics charts after generating a schedule", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ada");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ben");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await user.click(screen.getByRole("button", { name: "Generate Schedule" }));
    const chartButton = await screen.findByRole("button", { name: "View Metrics Charts" });
    expect(chartButton).toBeEnabled();

    await user.click(chartButton);

    expect(screen.getByRole("dialog", { name: "Schedule Metrics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resident utilization rate" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Number of 24-hr shifts per weekend" })).toBeInTheDocument();
    expect(screen.getByText("24-hr shifts / 36 pool hours")).toBeInTheDocument();
    expect(screen.getByText("% of Weekends that are Golden")).toBeInTheDocument();
    expect(screen.getByText("Requested Days Off Granted")).toBeInTheDocument();
    expect(screen.getByText("Recovery Goldens Granted")).toBeInTheDocument();
    expect(screen.getAllByText("Dr. Ada").length).toBeGreaterThan(0);
  });
});
