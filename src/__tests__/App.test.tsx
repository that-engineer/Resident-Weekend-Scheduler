import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import {
  LOCAL_STATE_STORAGE_KEY,
  createInitialState,
  saveLocalState,
  serializeState,
} from "../lib/state";

beforeEach(() => {
  localStorage.clear();
});

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

  it("restores saved browser data on render", () => {
    saveLocalState(buildSavedState("Dr. Ada", "PGY-2"));

    render(<App />);

    expect(screen.getByRole("columnheader", { name: "Dr. Ada PGY-2" })).toBeInTheDocument();
  });

  it("auto-saves scheduler data to localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ada");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toContain("Dr. Ada");
    });
  });

  it("replaces the browser save when importing scheduler data", async () => {
    const importedState = buildSavedState("Dr. Grace", "PGY-3");
    const importedJson = serializeState(importedState);
    const file = new File([importedJson], "scheduler-state.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve(importedJson),
    });
    render(<App />);

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByRole("columnheader", { name: "Dr. Grace PGY-3" })).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toContain("Dr. Grace");
    });
  });

  it("clears the browser save and resets the scheduler", async () => {
    const user = userEvent.setup();
    saveLocalState(buildSavedState("Dr. Ada", "PGY-2"));
    render(<App />);

    expect(screen.getByRole("columnheader", { name: "Dr. Ada PGY-2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear Browser Save" }));

    let dialog = screen.getByRole("dialog", { name: "Clear Schedule Data" });
    expect(screen.getByRole("columnheader", { name: "Dr. Ada PGY-2" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toContain("Dr. Ada");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Clear Schedule Data" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Dr. Ada PGY-2" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toContain("Dr. Ada");

    await user.click(screen.getByRole("button", { name: "Clear Browser Save" }));
    dialog = screen.getByRole("dialog", { name: "Clear Schedule Data" });
    await user.click(within(dialog).getByRole("button", { name: "Clear Data" }));

    expect(screen.queryByRole("columnheader", { name: "Dr. Ada PGY-2" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved browser data cleared.")).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(LOCAL_STATE_STORAGE_KEY)).toBeNull();
    });
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

  it("shows weekend vacation cells as vacation in the schedule view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add resident" }));
    await user.type(screen.getByLabelText("Name"), "Dr. Ada");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Vacation Hard unavailable" }));
    await user.click(screen.getAllByTitle("Not marked")[0]);
    await user.click(screen.getByRole("button", { name: "Weekend Schedule" }));

    expect(screen.getAllByTitle("Assign Dr. Ada")[0]).toHaveClass("vacation");
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

function buildSavedState(name: string, note: string) {
  return {
    ...createInitialState(new Date(2026, 5, 1)),
    residents: [{ id: "r1", name, note }],
  };
}
