# Getting help

OpenBijli is a volunteer, open-source project. Here is where to go.

| You want to | Go to |
|---|---|
| Ask how to use the app, CLIs or packages | [GitHub Discussions, Q&A](https://github.com/byjoellobo/openbijli/discussions) |
| Report that a bill or rate is wrong | The [Wrong number or bill](https://github.com/byjoellobo/openbijli/issues/new?template=data-error.yml) issue form |
| Tell us a new tariff order is out | The [New tariff order published](https://github.com/byjoellobo/openbijli/issues/new?template=tariff-order.yml) issue form |
| Report a bug in the code or firmware | The [Bug report](https://github.com/byjoellobo/openbijli/issues/new?template=bug_report.yml) issue form |
| Suggest a feature or a new state | The [Feature request](https://github.com/byjoellobo/openbijli/issues/new?template=feature_request.yml) issue form, or start a discussion |
| Report a security problem | Privately, as described in [SECURITY.md](SECURITY.md). Never in a public issue. |

## Reporting a wrong number well

A good report lets a reviewer fix the data in minutes:

1. Name the utility and tariff category (for example "MESCOM, LT-1 domestic").
2. Give the units, sanctioned load, billing period and meter type you entered.
3. Paste the line items from your bill, **after removing your name, account number, address
   and meter serial**. A photo is fine if it is cropped to the charges.
4. If you know where the correct value comes from, link the tariff order or notice and give
   the page number.

## Before you ask

- The [docs index](docs/README.md) links the methodology, data model and architecture notes.
- Every tariff book lists its known gaps. In the app, open **Tariff data** and expand your
  state; the value you are asking about may already be listed as unconfirmed.
- OpenBijli gives a well-sourced estimate, not legal or financial advice. For a formal dispute,
  use your utility's grievance process and its Consumer Grievance Redressal Forum.
