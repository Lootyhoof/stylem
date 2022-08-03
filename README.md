Stylem - a user style manager for Pale Moon, Interlink, SeaMonkey, and other Mozilla-based software. Install styles from [userstyles.org](https://userstyles.org/) to change how web pages and the application look.

Contributing
------------

Pull requests are welcome. Translation work can be done with a pull request.

Building
------------

Simply download the contents of the "src" folder and pack the contents into a .zip file. Then, rename the file to .xpi and drag into the browser.

On Unix systems (or Windows 10, with [WSL](https://docs.microsoft.com/en-us/windows/wsl/about)) you can optionally run `build.sh` instead. Running this as-is will produce a .xpi file ending in `-dev`, and if run from the command line and appending a number (e.g. `./build.sh 2`) will append that number to the filename instead.

Information on producing the `xpt` files featured here using the `idl` files in `src/idl/` can be found on [UDN](https://udn.realityripple.com/docs/Mozilla/Tech/XPIDL/Generating_xpt_on_Windows).

Download
------------

You can grab the latest release either from the Releases section of this repository, or the [Pale Moon Add-Ons Site](https://addons.palemoon.org/addon/stylem/). Please ensure that `Stylish` is disabled or removed (if installed) before installing to prevent any issues. Stylem will pick up any installed styles.

License
-------

Copyright (C) 2005-2014 Jason Barnabe <jason.barnabe@gmail.com>

Copyright (C) 2018-2022 Stylem Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
